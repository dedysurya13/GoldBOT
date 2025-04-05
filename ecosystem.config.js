// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "gold-bot",
      script: "./index.js",
      watch: false,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
