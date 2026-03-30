import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
  },
});

const PORT = 3000;

app.use(cors());
app.use(express.json());

const upload = multer({ dest: 'uploads/' });

// In-memory store for builds
const builds = new Map();

// Real build process
const startBuildProcess = (buildId: string, config: any) => {
  const build = builds.get(buildId);
  if (!build) return;

  build.status = 'building';
  build.progress = 0;
  
  const emitLog = (message: string, type: 'info' | 'error' | 'success' = 'info') => {
    const log = { timestamp: new Date().toISOString(), message, type };
    build.logs.push(log);
    io.to(buildId).emit('build-log', log);
  };

  const emitProgress = (progress: number) => {
    build.progress = progress;
    io.to(buildId).emit('build-progress', progress);
  };

  const emitStatus = (status: string) => {
    build.status = status;
    io.to(buildId).emit('build-status', status);
  };

  const workDir = path.join(process.cwd(), 'builds', buildId);
  
  // Create builds directory if it doesn't exist
  if (!fs.existsSync(path.join(process.cwd(), 'builds'))) {
    fs.mkdirSync(path.join(process.cwd(), 'builds'), { recursive: true });
  }

  // 1. Clone repo
  emitLog(`Cloning repository: ${config.githubUrl}...`);
  emitProgress(10);
  
  const gitClone = spawn('git', ['clone', config.githubUrl, workDir]);
  
  gitClone.stdout.on('data', (data) => emitLog(data.toString().trim()));
  gitClone.stderr.on('data', (data) => emitLog(data.toString().trim()));
  
  gitClone.on('close', (code) => {
    if (code !== 0) {
      emitLog('Failed to clone repository', 'error');
      emitStatus('failed');
      return;
    }
    
    emitLog('Repository cloned successfully.', 'success');
    emitProgress(30);
    
    if (config.projectType === 'gradle') {
      emitLog('Configuring Gradle memory limits to prevent Out of Memory (OOM) errors...');
      const gradlePropsPath = path.join(workDir, 'gradle.properties');
      let gradleProps = '';
      if (fs.existsSync(gradlePropsPath)) {
        gradleProps = fs.readFileSync(gradlePropsPath, 'utf-8');
      }
      if (!gradleProps.includes('org.gradle.jvmargs')) {
        fs.appendFileSync(gradlePropsPath, '\norg.gradle.jvmargs=-Xmx1536m -Dfile.encoding=UTF-8\n');
      }
      
      emitLog('Starting Gradle build (assembleDebug and bundleRelease)...');
      emitProgress(40);
      
      // Make gradlew executable
      if (fs.existsSync(path.join(workDir, 'gradlew'))) {
        fs.chmodSync(path.join(workDir, 'gradlew'), '755');
      } else {
        emitLog('Error: gradlew file not found in the repository root. Is this a valid Android project?', 'error');
        emitStatus('failed');
        return;
      }
      
      const buildProcess = spawn('./gradlew', ['assembleDebug', 'bundleRelease', '--no-daemon', '--max-workers=2'], { cwd: workDir });
      
      buildProcess.on('error', (err) => {
        emitLog(`Failed to start build process: ${err.message}`, 'error');
        emitStatus('failed');
      });

      buildProcess.stdout.on('data', (data) => emitLog(data.toString().trim()));
      buildProcess.stderr.on('data', (data) => emitLog(data.toString().trim(), 'error'));
      
      buildProcess.on('close', (buildCode) => {
        if (buildCode === 0) {
          emitLog('Build completed successfully!', 'success');
          emitProgress(100);
          emitStatus('completed');
          build.downloadUrl = `/api/download/${buildId}`;
          io.to(buildId).emit('build-complete', { downloadUrl: build.downloadUrl });
        } else {
          emitLog(`Build failed with exit code ${buildCode}`, 'error');
          emitStatus('failed');
        }
      });
    } else {
      emitLog('Only Gradle projects are fully implemented in this example.', 'error');
      emitStatus('failed');
    }
  });
};

// API Routes
app.post('/api/build', upload.single('sourceFile'), (req, res) => {
  const { githubUrl, projectType, buildType, buildVariant } = req.body;
  
  const buildId = uuidv4();
  
  const buildConfig = {
    id: buildId,
    githubUrl,
    hasFile: !!req.file,
    projectType,
    buildType,
    buildVariant,
    status: 'queued',
    progress: 0,
    logs: [],
    createdAt: new Date().toISOString(),
  };

  builds.set(buildId, buildConfig);

  // Start build asynchronously
  setTimeout(() => startBuildProcess(buildId, buildConfig), 1000);

  res.json({ buildId, status: 'queued' });
});

app.get('/api/status/:id', (req, res) => {
  const build = builds.get(req.params.id);
  if (!build) {
    return res.status(404).json({ error: 'Build not found' });
  }
  res.json({
    id: build.id,
    status: build.status,
    progress: build.progress,
    downloadUrl: build.downloadUrl,
  });
});

app.get('/api/logs/:id', (req, res) => {
  const build = builds.get(req.params.id);
  if (!build) {
    return res.status(404).json({ error: 'Build not found' });
  }
  res.json({ logs: build.logs });
});

app.get('/api/download/:id', (req, res) => {
  const build = builds.get(req.params.id);
  if (!build || build.status !== 'completed') {
    return res.status(404).send('File not found or build not complete');
  }
  
  const workDir = path.join(process.cwd(), 'builds', req.params.id);
  let filePath = '';
  
  if (build.buildType === 'apk') {
    filePath = path.join(workDir, 'app/build/outputs/apk/debug/app-debug.apk');
  } else {
    filePath = path.join(workDir, 'app/build/outputs/bundle/release/app-release.aab');
  }
  
  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    // Fallback if file is missing
    res.setHeader('Content-disposition', `attachment; filename=app-${build.buildType === 'apk' ? 'debug.apk' : 'release.aab'}`);
    res.setHeader('Content-type', 'application/vnd.android.package-archive');
    res.send('Build completed, but actual binary file was not found at ' + filePath);
  }
});

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('subscribe-build', (buildId) => {
    socket.join(buildId);
    console.log(`Client ${socket.id} subscribed to build ${buildId}`);
    
    // Send existing logs
    const build = builds.get(buildId);
    if (build) {
      socket.emit('build-sync', {
        status: build.status,
        progress: build.progress,
        logs: build.logs,
        downloadUrl: build.downloadUrl
      });
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
