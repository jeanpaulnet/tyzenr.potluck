import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Proxy for external potluck save API
  app.post("/api/external-save/:userId", async (req, res) => {
    const { userId } = req.params;
    const { Id, Content } = req.body;
    
    console.log(`Forwarding save for potluck ${Id} and user ${userId} to external API`);
    
    try {
      const response = await fetch(`https://webapi.tyzenr.com/potluck/save/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Id, Content })
      });
      
      const status = response.status;
      console.log(`External API responded with status: ${status}`);
      res.status(status).json({ success: response.ok });
    } catch (error) {
      console.error("External API error:", error);
      res.status(500).json({ error: "Failed to call external API" });
    }
  });

  // Request logging
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
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
