module.exports = {
  apps: [
    {
      name: 'vaistai',
      script: 'server.js',
      cwd: '/home/ubuntu/vaistai',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '800M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: '/home/ubuntu/vaistai/logs/error.log',
      out_file: '/home/ubuntu/vaistai/logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      time: true
    }
  ]
};
