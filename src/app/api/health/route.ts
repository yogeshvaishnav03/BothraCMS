import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import net from "net";
import tls from "tls";

export const dynamic = "force-dynamic";

function testTcpTls(host: string, port: number, user: string, database: string): Promise<any> {
  return new Promise((resolve) => {
    const result: any = { host, port, tcp: false, tls: false, pgResponse: null, error: null };
    const socket = net.createConnection(port, host, () => {
      result.tcp = true;
      // Send SSLRequest
      const sslReq = Buffer.alloc(8);
      sslReq.writeInt32BE(8, 0);
      sslReq.writeInt32BE(80877103, 4);
      socket.write(sslReq);
    });

    socket.once("data", (data) => {
      const char = data.toString("ascii");
      if (char === "S") {
        const tlsSocket = tls.connect({ socket, servername: host, rejectUnauthorized: false }, () => {
          result.tls = true;
          // Send StartupMessage
          const params = `user\0${user}\0database\0${database}\0\0`;
          const len = 4 + 4 + Buffer.byteLength(params, "utf-8");
          const startup = Buffer.alloc(len);
          startup.writeInt32BE(len, 0);
          startup.writeInt32BE(196608, 4);
          startup.write(params, 8, "utf-8");
          tlsSocket.write(startup);
        });

        tlsSocket.once("data", (d) => {
          const type = String.fromCharCode(d[0]);
          result.pgResponseType = type;
          if (type === "E") {
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
            result.pgError = fields;
          } else if (type === "R") {
            const authCode = d.length >= 9 ? d.readInt32BE(5) : null;
            result.pgAuthCode = authCode; // 10 = SASL SCRAM-SHA-256
          }
          tlsSocket.end();
          resolve(result);
        });

        tlsSocket.on("error", (e) => {
          result.tlsError = e.message;
          resolve(result);
        });
      } else {
        socket.end();
        resolve(result);
      }
    });

    socket.on("error", (err) => {
      result.error = err.message;
      resolve(result);
    });

    setTimeout(() => {
      if (!result.tcp || !result.tls) {
        result.timedOut = true;
      }
      socket.destroy();
      resolve(result);
    }, 4000);
  });
}

export async function GET() {
  const rawDbUrl =
    process.env.POSTGRES_PRISMA_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    "";

  let urlInfo: any = null;
  try {
    if (rawDbUrl && !rawDbUrl.startsWith("file:")) {
      const u = new URL(rawDbUrl);
      urlInfo = {
        protocol: u.protocol,
        username: u.username,
        host: u.hostname,
        port: u.port || "5432",
        pathname: u.pathname,
        hasPassword: !!u.password,
        passwordLen: u.password ? u.password.length : 0,
        search: u.search,
      };
    }
  } catch (err: any) {
    urlInfo = { parseError: err.message };
  }

  // 1. Try Prisma first
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1 as result`;
    const latencyMs = Date.now() - start;

    return NextResponse.json({
      status: "ok",
      database: "connected",
      latencyMs,
      urlInfo,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  } catch (prismaErr: any) {
    // 2. If Prisma fails, run low-level TCP/TLS probe
    let probeResult = null;
    if (urlInfo && urlInfo.host) {
      probeResult = await testTcpTls(
        urlInfo.host,
        parseInt(urlInfo.port, 10),
        urlInfo.username || "default",
        urlInfo.pathname ? urlInfo.pathname.replace(/^\//, "") : "verceldb"
      );
    }

    return NextResponse.json(
      {
        status: "error",
        errorName: prismaErr?.name,
        errorMessage: prismaErr?.message,
        urlInfo,
        probeResult,
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
