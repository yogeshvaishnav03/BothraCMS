import { test, expect } from "@playwright/test";

test.describe("E2E Journey 10: Measurement Book & Private Uploads Access Control", () => {
  test("should enforce authenticated access and return MB records for authorized users", async ({ request }) => {
    // 1. Unauthenticated request must fail
    const unauthRes = await request.get("/api/measurement-book");
    expect(unauthRes.status()).toBe(401);

    // 2. Authenticate as ORG_ADMIN
    const loginRes = await request.post("/api/auth/login", {
      data: {
        email: "admin@buildtrack.pro",
        password: "Password123!",
      },
    });
    expect(loginRes.status()).toBe(200);

    // 3. Authorized request must succeed
    const authRes = await request.get("/api/measurement-book");
    expect(authRes.status()).toBe(200);
    const body = await authRes.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("should enforce strict upload validation, authenticated retrieval, and block public static access", async ({ request }) => {
    // 1. Unauthenticated upload must return 401
    const unauthUpload = await request.post("/api/uploads", {
      multipart: {
        file: {
          name: "test.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.from("%PDF-1.4 test content"),
        },
      },
    });
    expect(unauthUpload.status()).toBe(401);

    // 2. Authenticate
    await request.post("/api/auth/login", {
      data: {
        email: "admin@buildtrack.pro",
        password: "Password123!",
      },
    });

    // 3. Authenticated upload with valid PDF magic bytes
    const pdfBuffer = Buffer.from("%PDF-1.4\n%Authentic test file\nTrailer\n%%EOF");
    const uploadRes = await request.post("/api/uploads", {
      multipart: {
        file: {
          name: "contract-measurement.pdf",
          mimeType: "application/pdf",
          buffer: pdfBuffer,
        },
      },
    });
    expect(uploadRes.status()).toBe(201);
    const uploadData = await uploadRes.json();
    expect(uploadData.success).toBe(true);
    const fileId = uploadData.data.id;
    expect(fileId).toBeDefined();

    // 4. Authenticated download succeeds with appropriate headers
    const downloadRes = await request.get(`/api/uploads/${fileId}`);
    expect(downloadRes.status()).toBe(200);
    expect(downloadRes.headers()["content-type"]).toBe("application/pdf");

    // 5. Verify direct public static URL access is blocked (cannot bypass via /uploads or /storage)
    const publicStaticRes = await request.get(`/uploads/${fileId}`);
    expect([404, 401]).toContain(publicStaticRes.status());

    const directStorageRes = await request.get(`/storage/uploads/private/${fileId}`);
    expect([404, 401]).toContain(directStorageRes.status());
  });

  test("should reject malicious file uploads disguised with spoofed mime type", async ({ request }) => {
    await request.post("/api/auth/login", {
      data: {
        email: "admin@buildtrack.pro",
        password: "Password123!",
      },
    });

    // Malicious script payload disguised with image/png MIME
    const spoofedPayload = Buffer.from("<script>alert('XSS-injection')</script>");
    const maliciousUpload = await request.post("/api/uploads", {
      multipart: {
        file: {
          name: "exploit.png",
          mimeType: "image/png",
          buffer: spoofedPayload,
        },
      },
    });

    // Server must reject due to magic bytes validation failure
    expect(maliciousUpload.status()).toBe(400);
    const resBody = await maliciousUpload.json();
    expect(resBody.success).toBe(false);
  });
});
