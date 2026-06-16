const fs = require('fs');
const path = require('path');

// Next.js no lee el PORT desde el archivo .env automáticamente al iniciar el servidor.
// Por ende, lo parseamos manualmente aquí para PM2.
let port = 3000;
try {
  const envPath = path.resolve(__dirname, '.env.local');
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    const portMatch = envFile.match(/^PORT\s*=\s*(\d+)/m);
    if (portMatch && portMatch[1]) {
      port = parseInt(portMatch[1], 10);
    }
  }
} catch (error) {
  console.warn("No se pudo leer .env.local para obtener el PORT. Usando 3000 por defecto.");
}

module.exports = {
  apps: [
    {
      name: "konexa-docs-proxy",
      script: "node_modules/next/dist/bin/next",
      args: `start -p ${port}`,
      instances: "max", 
      exec_mode: "cluster", 
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: port
      },
    },
  ],
};
