import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Build standalone : Next.js copie dans .next/standalone une app autonome
  // (server.js + node_modules minimum) qu'on déploie directement dans Docker.
  output: 'standalone',

  // On ancre le file-tracing à la racine du projet : sans ça, Next.js remonte
  // jusqu'à la racine du user pour trouver un lockfile parent et la sortie
  // standalone finit imbriquée dans un sous-chemin (Desktop/Simulateur V2/...).
  outputFileTracingRoot: path.resolve(process.cwd()),

  // File tracing : on inclut explicitement les artefacts dont Next.js ne peut
  // pas deviner la présence. Deux catégories :
  //
  // 1. Fichiers "data" jamais importés par le code : migrations SQL.
  //
  // 2. Packages node utilisés UNIQUEMENT par des scripts runtime hors-webpack
  //    (scripts/migrate.mjs, scripts/create-user.mjs). Next.js inline les deps
  //    serveur dans ses bundles — pour les scripts .mjs lancés à part par
  //    l'entrypoint Docker, on a besoin de ces packages en tant que vrais
  //    node_modules dans l'image. On trace leur arbo complète pour que leurs
  //    deps transitives suivent.
  outputFileTracingIncludes: {
    '/**/*': [
      './drizzle/**/*',
      './node_modules/better-sqlite3/**/*',
      './node_modules/drizzle-orm/**/*',
      './node_modules/bcryptjs/**/*',
      './node_modules/nanoid/**/*',
      // zod est bundlé dans les routes Next, mais scripts/create-user.mjs
      // tourne hors-webpack et en a besoin comme vrai node_module pour
      // appliquer la MÊME validation email que LoginSchema côté API.
      './node_modules/zod/**/*',
    ],
  },
};

export default nextConfig;
