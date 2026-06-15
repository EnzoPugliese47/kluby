import path from "node:path";
import express, { type Application } from "express";
import cors from "cors";
import apiRoutes from "./routes";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler";

/** Construye la aplicacion Express con middlewares y rutas montadas. */
export const createApp = (): Application => {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Panel de estadisticas (frontend estatico) en la raiz "/".
  // En dev (__dirname = src) y en build (__dirname = dist) resuelve a /public.
  // Forzamos revalidacion del HTML para evitar que el navegador sirva una
  // version cacheada y vieja del panel/sitio.
  app.use(
    express.static(path.join(__dirname, "..", "public"), {
      etag: true,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith(".html")) {
          res.setHeader("Cache-Control", "no-cache, must-revalidate");
        }
      },
    })
  );

  app.use("/api", apiRoutes);

  // Manejo de rutas no encontradas y errores (siempre al final).
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
