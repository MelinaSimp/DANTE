const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const isDev = process.env.NODE_ENV === 'development';

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
    },
    icon: path.join(__dirname, '../public/brand/logo-circle.png'),
    titleBarStyle: 'default',
    backgroundColor: '#242423',
    show: false, // Don't show until loaded
  });

  // Load the Vercel-hosted app or local dev server
  // The custom domain might have redirect issues, so we'll use Vercel URL directly
  // You can find your Vercel URL in: Vercel Dashboard → Your Project → Settings → Domains
  // Or check the latest deployment URL
  
  // Try to get Vercel URL from environment or use a known one
  // Replace this with your actual Vercel deployment URL
  const vercelUrl = process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}`
    : null; // You can add your Vercel URL here: 'https://drift-xxxxx.vercel.app'
  
  const customDomain = 'https://driftai.studio';
  
  // Use environment variable if set, otherwise try Vercel URL, then custom domain
  let url;
  if (isDev) {
    url = 'http://localhost:3000';
  } else if (process.env.ELECTRON_APP_URL) {
    url = process.env.ELECTRON_APP_URL;
  } else if (vercelUrl) {
    url = vercelUrl;
  } else {
    // Fallback to custom domain (might have redirect issues)
    url = customDomain;
  }
  
  console.log(`[Electron] Loading URL: ${url}`);
  
  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Handle load errors
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error(`[Electron] Failed to load: ${errorCode} - ${errorDescription}`);
    console.error(`[Electron] URL: ${validatedURL}`);
    console.error(`[Electron] Error code: ${errorCode}`);
    
    // Show error dialog
    dialog.showErrorBox(
      'Failed to Load App',
      `Unable to connect to the application.\n\nError: ${errorDescription} (Code: ${errorCode})\n\nURL: ${url}\n\nPlease check your internet connection and try again.\n\nYou can also try running in development mode:\nnpm run electron:dev`
    );
  });

  // Handle successful load
  mainWindow.webContents.on('did-finish-load', () => {
    console.log(`[Electron] Successfully loaded: ${url}`);
  });

  // Load the URL with proper user agent to handle redirects
  // For production, load /auth directly to avoid redirect loops
  const loadUrl = (!isDev && url.includes('driftai.studio')) 
    ? `${url}/auth` 
    : url;
  
  console.log(`[Electron] Loading URL: ${loadUrl}`);
  
  mainWindow.loadURL(loadUrl, {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    httpReferrer: loadUrl
  }).catch((error) => {
    console.error(`[Electron] Load error:`, error);
    dialog.showErrorBox(
      'Failed to Load App',
      `Unable to load the application.\n\nError: ${error.message}\n\nURL: ${loadUrl}`
    );
  });

  // Open DevTools in development or if DEBUG env var is set
  if (isDev || process.env.DEBUG === 'true') {
    mainWindow.webContents.openDevTools();
  }
  
  // Log navigation events for debugging
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    console.log(`[Electron] Navigating to: ${navigationUrl}`);
  });
  
  mainWindow.webContents.on('did-start-loading', () => {
    console.log(`[Electron] Started loading...`);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle external links - open in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    require('electron').shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle certificate errors
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  // For Vercel (which uses valid certificates), we should not bypass
  // Only bypass in development for localhost
  if (isDev && url.includes('localhost')) {
    event.preventDefault();
    callback(true);
  } else {
    // For production, let Electron handle certificate validation normally
    callback(false);
  }
});

// Additional security: Allow navigation only to our domains
app.on('web-contents-created', (event, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    
    // Allow navigation to Vercel domains, custom domain, and localhost
    const allowedDomains = [
      'vercel.app',
      'driftai.studio',
      'localhost',
      '127.0.0.1'
    ];
    
    const isAllowed = allowedDomains.some(domain => 
      parsedUrl.hostname.includes(domain)
    );
    
    if (!isAllowed) {
      event.preventDefault();
      console.warn(`[Electron] Blocked navigation to: ${navigationUrl}`);
    }
  });
});

