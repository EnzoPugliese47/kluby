import path from "node:path";
import express, { type Application, type RequestHandler } from "express";
import cors from "cors";
import apiRoutes from "./routes";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler";

const publicDir = path.join(__dirname, "..", "public");

/** 404 HTML para rutas del sitio (no API). */
const htmlNotFoundHandler: RequestHandler = (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  if (/\.[a-z0-9]+$/i.test(req.path)) return next();
  res.status(404).sendFile(path.join(publicDir, "404.html"));
};

/** Construye la aplicacion Express con middlewares y rutas montadas (Kluby API). */
export const createApp = (): Application => {
  const app = express();

  app.use(cors());
  // Limite amplio para permitir subir imagenes (planos de salon) en base64.
  app.use(express.json({ limit: "12mb" }));
  app.use(express.urlencoded({ extended: true, limit: "12mb" }));

  // Panel de estadisticas (frontend estatico) en la raiz "/".
  // En dev (__dirname = src) y en build (__dirname = dist) resuelve a /public.
  // Forzamos revalidacion del HTML para evitar que el navegador sirva una
  // version cacheada y vieja del panel/sitio.
  app.use(
    express.static(publicDir, {
      etag: true,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith(".html")) {
          res.setHeader("Cache-Control", "no-cache, must-revalidate");
        }
      },
    })
  );

  // URL limpia para ficha publica de boliche.
  app.get("/boliche/:id", (req, res) => {
    res.redirect(302, `/boliche.html?id=${encodeURIComponent(req.params.id)}`);
  });

  app.use("/api", apiRoutes);

  app.use(htmlNotFoundHandler);

  // Manejo de rutas no encontradas y errores (siempre al final).
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
