module.exports = {
  apps: [
    {
      name: "konexa-docs-proxy",
      script: "node_modules/next/dist/bin/next",
      args: "start",
      instances: "max", // Escala automáticamente usando todos los núcleos disponibles
      exec_mode: "cluster", // Modo clúster para mejor rendimiento sin caídas
      watch: false,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
