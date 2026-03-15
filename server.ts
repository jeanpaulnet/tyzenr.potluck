import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Request logging middleware - moved to top to catch all requests
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    if (Object.keys(req.params).length > 0) console.log('Params:', req.params);
    if (Object.keys(req.query).length > 0) console.log('Query:', req.query);
    if (req.method !== 'GET' && Object.keys(req.body).length > 0) {
      console.log('Body:', JSON.stringify(req.body, null, 2));
    }
    next();
  });

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Proxy for external backup list API
  app.get("/api/common/list/:userId", async (req, res) => {
    const { userId } = req.params;
    const externalUrl = `https://webapi.tyzenr.com/common/list/${userId}`;
    console.log(`[EXTERNAL REQ] GET ${externalUrl}`);
    
    try {
      const response = await fetch(externalUrl, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      
      console.log(`[EXTERNAL RES] GET ${externalUrl} - Status: ${response.status}`);
      
      if (!response.ok) {
        throw new Error(`External API responded with status: ${response.status}`);
      }
      
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error(`[EXTERNAL ERR] GET ${externalUrl}:`, error);
      res.status(500).json({ error: "Failed to fetch from external backup API" });
    }
  });

  // Proxy for external backup save API
  app.post("/api/common", async (req, res) => {
    const { userId, Id, Content } = req.body;
    const externalUrl = `https://webapi.tyzenr.com/common`;
    const payload = { userId, Id, Content };
    
    console.log(`[EXTERNAL REQ] POST ${externalUrl}`);
    console.log(`[EXTERNAL REQ BODY]`, JSON.stringify(payload, null, 2));
    
    try {
      const response = await fetch(externalUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const status = response.status;
      console.log(`[EXTERNAL RES] POST ${externalUrl} - Status: ${status}`);
      res.status(status).json({ success: response.ok });
    } catch (error) {
      console.error(`[EXTERNAL ERR] POST ${externalUrl}:`, error);
      res.status(500).json({ error: "Failed to call external backup API" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting server in DEVELOPMENT mode");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    
    // SPA fallback for dev
    app.get("*", async (req, res, next) => {
      const url = req.originalUrl;
      // Skip API routes
      if (url.startsWith('/api')) return next();
      
      try {
        const fs = await import('fs');
        const template = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
        const html = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    console.log("Starting server in PRODUCTION mode");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    
    // SPA fallback: serve index.html for all non-file requests
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
