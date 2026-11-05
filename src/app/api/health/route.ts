import { NextResponse } from "next/server";
import net from "net";
import tls from "tls";
import crypto from "crypto";

export const dynamic = "force-dynamic";

// SCRAM helper functions
function Hi(password: string, salt: Buffer, iterations: number): Buffer {
  return crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256");
}

function HMAC(key: Buffer | string, data: Buffer | string): Buffer {
  return crypto.createHmac("sha256", key).update(data).digest();
}

function H(data: Buffer | string): Buffer {
  return crypto.createHash("sha256").update(data).digest();
}

function xor(a: Buffer, b: Buffer): Buffer {
  const res = Buffer.alloc(a.length);
  for (let i = 0; i < a.length; i++) res[i] = a[i] ^ b[i];
  return res;
}

function testPostgresAuth(host: string, port: number, user: string, database: string, password: string): Promise<any> {
  return new Promise((resolve) => {
    const report: any = { host, port, user, database, tcp: false, tls: false };
    const socket = net.createConnection(port, host, () => {
      report.tcp = true;
      const sslReq = Buffer.alloc(8);
      sslReq.writeInt32BE(8, 0);
      sslReq.writeInt32BE(80877103, 4);
      socket.write(sslReq);
    });

    socket.once("data", (data) => {
      if (data.toString("ascii") !== "S") {
        report.error = "No SSL support";
        socket.destroy();
        return resolve(report);
      }

      const tlsSocket = tls.connect({ socket, servername: host, rejectUnauthorized: false }, () => {
        report.tls = true;
        const params = `user\0${user}\0database\0${database}\0\0`;
        const len = 4 + 4 + Buffer.byteLength(params, "utf-8");
        const startup = Buffer.alloc(len);
        startup.writeInt32BE(len, 0);
        startup.writeInt32BE(196608, 4);
        startup.write(params, 8, "utf-8");
        tlsSocket.write(startup);
      });

      let clientNonce = crypto.randomBytes(18).toString("base64");
      let clientFirstBare = `n=${user},r=${clientNonce}`;

      tlsSocket.on("data", (d) => {
        const type = String.fromCharCode(d[0]);
        if (type === "R") {
          const authCode = d.readInt32BE(5);
          if (authCode === 10) {
            // AuthenticationSASL
            const mech = "SCRAM-SHA-256\0";
            const clientFirst = `n,,${clientFirstBare}`;
            const dataLen = Buffer.byteLength(clientFirst, "utf-8");
            const payload = Buffer.concat([
              Buffer.from(mech, "utf-8"),
              Buffer.alloc(4),
              Buffer.from(clientFirst, "utf-8"),
            ]);
            payload.writeInt32BE(dataLen, Buffer.byteLength(mech, "utf-8"));

            const pMsg = Buffer.alloc(5 + payload.length);
            pMsg.write("p", 0);
            pMsg.writeInt32BE(4 + payload.length, 1);
            payload.copy(pMsg, 5);
            tlsSocket.write(pMsg);
          } else if (authCode === 11) {
            // AuthenticationSASLContinue
            const serverFirst = d.slice(9).toString("utf-8");
            report.serverFirst = serverFirst;
            
            // Parse r, s, i
            const parts = serverFirst.split(",");
            let serverNonce = "", saltB64 = "", iter = 4096;
            for (const p of parts) {
              if (p.startsWith("r=")) serverNonce = p.slice(2);
              if (p.startsWith("s=")) saltB64 = p.slice(2);
              if (p.startsWith("i=")) iter = parseInt(p.slice(2), 10);
            }

            const salt = Buffer.from(saltB64, "base64");
            const saltedPassword = Hi(password, salt, iter);
            const clientKey = HMAC(saltedPassword, "Client Key");
            const storedKey = H(clientKey);
            const authMessage = `${clientFirstBare},${serverFirst},c=biws,r=${serverNonce}`;
            const clientSignature = HMAC(storedKey, authMessage);
            const clientProof = xor(clientKey, clientSignature).toString("base64");
            const clientFinal = `c=biws,r=${serverNonce},p=${clientProof}`;

            const pMsg = Buffer.alloc(5 + Buffer.byteLength(clientFinal, "utf-8"));
            pMsg.write("p", 0);
            pMsg.writeInt32BE(4 + Buffer.byteLength(clientFinal, "utf-8"), 1);
            pMsg.write(clientFinal, 5, "utf-8");
            tlsSocket.write(pMsg);
          } else if (authCode === 12) {
            // AuthenticationSASLFinal
            report.authSuccess = true;
          } else if (authCode === 0) {
            // AuthenticationOk
            report.authOk = true;
            tlsSocket.end();
            resolve(report);
          }
        } else if (type === "E") {
          // ErrorResponse
          const fields: Record<string, string> = {};
          let offset = 5;
          while (offset < d.length) {
            const code = String.fromCharCode(d[offset++]);
            if (code === "\0") break;
            let end = offset;
            while (end < d.length && d[end] !== 0) end++;
            fields[code] = d.slice(offset, end).toString("utf-8");
            offset = end + 1;
          }
          report.postgresError = fields;
          tlsSocket.end();
          resolve(report);
        } else if (type === "Z") {
          // ReadyForQuery
          report.ready = true;
          tlsSocket.end();
          resolve(report);
        }
      });

      tlsSocket.on("error", (e) => {
        report.tlsError = e.message;
        resolve(report);
      });
    });

    socket.on("error", (e) => {
      report.tcpError = e.message;
      resolve(report);
    });

    setTimeout(() => {
      report.timedOut = true;
      socket.destroy();
      resolve(report);
    }, 6000);
  });
}

export async function GET() {
  const rawDbUrl =
    process.env.POSTGRES_PRISMA_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    "";

  let authReport = null;
  if (rawDbUrl && !rawDbUrl.startsWith("file:")) {
    try {
      const u = new URL(rawDbUrl);
      const host = u.hostname;
      const port = parseInt(u.port || "5432", 10);
      const user = decodeURIComponent(u.username || "neondb_owner");
      const password = decodeURIComponent(u.password || "");
      const database = (u.pathname || "/neondb").replace(/^\//, "");

      authReport = await testPostgresAuth(host, port, user, database, password);
    } catch (e: any) {
      authReport = { parseError: e.message };
    }
  }

  return NextResponse.json({
    authReport,
    timestamp: new Date().toISOString(),
  });
}
