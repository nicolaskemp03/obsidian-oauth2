const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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
  // Ignorar errores, usar el puerto por defecto
}

console.log(`\n> Iniciando servidor de desarrollo en el puerto: ${port}\n`);
execSync(`node_modules/next/dist/bin/next dev -p ${port}`, { stdio: 'inherit' });
