import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

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

// Simulated build process
const startSimulatedBuild = (buildId: string, config: any) => {
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

  // Simulation steps
  const steps = [
    { msg: 'Initializing build environment...', time: 1000, progress: 5 },
    { msg: `Pulling Docker image for ${config.projectType}...`, time: 2000, progress: 15 },
    { msg: 'Cloning/Extracting source code...', time: 1500, progress: 25 },
    { msg: 'Resolving dependencies...', time: 3000, progress: 40 },
    { msg: `Running build command: ${config.projectType === 'gradle' ? './gradlew assembleRelease' : 'flutter build apk'}`, time: 1000, progress: 45 },
    { msg: 'Compiling source code...', time: 4000, progress: 70 },
    { msg: 'Running R8/ProGuard...', time: 2000, progress: 85 },
    { msg: 'Signing APK/AAB...', time: 1500, progress: 95 },
    { msg: 'Build completed successfully!', time: 1000, progress: 100, type: 'success' as const },
  ];

  let currentStep = 0;

  const runNextStep = () => {
    if (currentStep >= steps.length) {
      emitStatus('completed');
      build.downloadUrl = `/api/download/${buildId}`;
      io.to(buildId).emit('build-complete', { downloadUrl: build.downloadUrl });
      return;
    }

    const step = steps[currentStep];
    emitLog(step.msg, step.type || 'info');
    emitProgress(step.progress);

    currentStep++;
    setTimeout(runNextStep, step.time);
  };

  // Start simulation
  setTimeout(runNextStep, 500);
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
  setTimeout(() => startSimulatedBuild(buildId, buildConfig), 1000);

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
  // Simulate file download
  res.setHeader('Content-disposition', `attachment; filename=app-${build.buildType === 'apk' ? 'release.apk' : 'release.aab'}`);
  res.setHeader('Content-type', 'application/vnd.android.package-archive');
  res.send('Simulated APK/AAB binary content');
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
