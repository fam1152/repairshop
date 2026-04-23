const { app, BrowserWindow } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');

// ── DATA FOLDER SETUP ──
const documentsPath = path.join(os.homedir(), 'Documents', 'Repair Shop');
if (!fs.existsSync(documentsPath)) {
  fs.mkdirSync(documentsPath, { recursive: true });
}

// Set environment variables for the backend to use the Documents folder
process.env.DB_PATH = path.join(documentsPath, 'repairshop.sqlite');
process.env.UPLOADS_PATH = path.join(documentsPath, 'uploads');
process.env.PRINT_QUEUE_PATH = path.join(documentsPath, 'print-queue');
process.env.NODE_ENV = 'production';
process.env.PORT = '3000';

let mainWindow;

function createWindow() {
  // Start the backend server
  require('./server/index.js');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "Repair Shop Management System",
    icon: path.join(__dirname, 'icons', 'repairshop.svg'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Load the React app (wait a moment for server to start)
  setTimeout(() => {
    mainWindow.loadURL('http://localhost:3000');
  }, 2000);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
