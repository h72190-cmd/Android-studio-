import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Terminal, Upload, Github, Play, Download, CheckCircle2, XCircle, Loader2, Info } from 'lucide-react';
import { io, Socket } from 'socket.io-client';

export default function App() {
  const [activeTab, setActiveTab] = useState('new-build');
  const [buildId, setBuildId] = useState<string | null>(null);
  
  // Form state
  const [sourceType, setSourceType] = useState<'upload' | 'github'>('github');
  const [githubUrl, setGithubUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [projectType, setProjectType] = useState('gradle');
  const [buildType, setBuildType] = useState('apk');
  const [buildVariant, setBuildVariant] = useState('release');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Build state
  const [socket, setSocket] = useState<Socket | null>(null);
  const [buildStatus, setBuildStatus] = useState<string>('idle');
  const [buildProgress, setBuildProgress] = useState(0);
  const [logs, setLogs] = useState<{ timestamp: string; message: string; type: string }[]>([]);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  useEffect(() => {
    const newSocket = io();
    setSocket(newSocket);
    return () => {
      newSocket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!socket || !buildId) return;

    socket.emit('subscribe-build', buildId);

    socket.on('build-sync', (data) => {
      setBuildStatus(data.status);
      setBuildProgress(data.progress);
      setLogs(data.logs || []);
      setDownloadUrl(data.downloadUrl);
    });

    socket.on('build-log', (log) => {
      setLogs((prev) => [...prev, log]);
    });

    socket.on('build-progress', (progress) => {
      setBuildProgress(progress);
    });

    socket.on('build-status', (status) => {
      setBuildStatus(status);
    });

    socket.on('build-complete', (data) => {
      setDownloadUrl(data.downloadUrl);
      setBuildStatus('completed');
    });

    return () => {
      socket.off('build-sync');
      socket.off('build-log');
      socket.off('build-progress');
      socket.off('build-status');
      socket.off('build-complete');
    };
  }, [socket, buildId]);

  const startBuild = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append('projectType', projectType);
      formData.append('buildType', buildType);
      formData.append('buildVariant', buildVariant);
      
      if (sourceType === 'github') {
        formData.append('githubUrl', githubUrl);
      } else if (file) {
        formData.append('sourceFile', file);
      }

      const response = await fetch('/api/build', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Failed to start build');

      const data = await response.json();
      setBuildId(data.buildId);
      setLogs([]);
      setBuildProgress(0);
      setBuildStatus('queued');
      setDownloadUrl(null);
      setActiveTab('status');
    } catch (error) {
      console.error('Build error:', error);
      alert('Failed to start build. Check console for details.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 p-4 md:p-8 font-sans">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
              <Terminal className="w-8 h-8 text-emerald-500" />
              CloudBuild
            </h1>
            <p className="text-zinc-400 mt-1">Mobile App Compilation Platform</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="bg-amber-500/10 border-amber-500/50 text-amber-500 flex items-center gap-1">
              <Info className="w-3 h-3" /> Simulation Mode
            </Badge>
            <Badge variant="outline" className="bg-zinc-900 border-zinc-800 text-zinc-300">
              v1.0.0-beta
            </Badge>
          </div>
        </header>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2 bg-zinc-900 border border-zinc-800">
            <TabsTrigger value="new-build" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white">New Build</TabsTrigger>
            <TabsTrigger value="status" disabled={!buildId} className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white">Build Status</TabsTrigger>
          </TabsList>
          
          <TabsContent value="new-build" className="mt-6">
            <Card className="bg-zinc-900 border-zinc-800 text-zinc-100">
              <CardHeader>
                <CardTitle>Configure Build</CardTitle>
                <CardDescription className="text-zinc-400">Upload your source code or link a repository to start building.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={startBuild} className="space-y-6">
                  {/* Source Selection */}
                  <div className="space-y-4">
                    <Label className="text-base">Source Code</Label>
                    <div className="grid grid-cols-2 gap-4">
                      <div 
                        className={`border rounded-lg p-4 cursor-pointer flex flex-col items-center gap-2 transition-colors ${sourceType === 'github' ? 'border-emerald-500 bg-emerald-500/10' : 'border-zinc-800 hover:border-zinc-700 bg-zinc-950'}`}
                        onClick={() => setSourceType('github')}
                      >
                        <Github className="w-6 h-6" />
                        <span className="font-medium">GitHub Repository</span>
                      </div>
                      <div 
                        className={`border rounded-lg p-4 cursor-pointer flex flex-col items-center gap-2 transition-colors ${sourceType === 'upload' ? 'border-emerald-500 bg-emerald-500/10' : 'border-zinc-800 hover:border-zinc-700 bg-zinc-950'}`}
                        onClick={() => setSourceType('upload')}
                      >
                        <Upload className="w-6 h-6" />
                        <span className="font-medium">Upload ZIP</span>
                      </div>
                    </div>

                    {sourceType === 'github' ? (
                      <div className="space-y-2">
                        <Label htmlFor="githubUrl">Repository URL</Label>
                        <Input 
                          id="githubUrl" 
                          placeholder="https://github.com/username/repo" 
                          value={githubUrl}
                          onChange={(e) => setGithubUrl(e.target.value)}
                          required
                          className="bg-zinc-950 border-zinc-800 focus-visible:ring-emerald-500"
                        />
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Label htmlFor="fileUpload">Project ZIP File</Label>
                        <Input 
                          id="fileUpload" 
                          type="file" 
                          accept=".zip"
                          onChange={(e) => setFile(e.target.files?.[0] || null)}
                          required
                          className="bg-zinc-950 border-zinc-800 focus-visible:ring-emerald-500 file:text-zinc-300"
                        />
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Project Type */}
                    <div className="space-y-2">
                      <Label>Project Type</Label>
                      <select 
                        value={projectType}
                        onChange={(e) => setProjectType(e.target.value)}
                        className="flex h-10 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                      >
                        <option value="gradle">Android (Gradle)</option>
                        <option value="flutter">Flutter</option>
                        <option value="react-native">React Native</option>
                      </select>
                    </div>

                    {/* Build Type */}
                    <div className="space-y-2">
                      <Label>Output Format</Label>
                      <select 
                        value={buildType}
                        onChange={(e) => setBuildType(e.target.value)}
                        className="flex h-10 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                      >
                        <option value="apk">APK (Universal)</option>
                        <option value="aab">App Bundle (AAB)</option>
                      </select>
                    </div>

                    {/* Build Variant */}
                    <div className="space-y-2">
                      <Label>Build Variant</Label>
                      <select 
                        value={buildVariant}
                        onChange={(e) => setBuildVariant(e.target.value)}
                        className="flex h-10 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                      >
                        <option value="release">Release</option>
                        <option value="debug">Debug</option>
                      </select>
                    </div>
                  </div>

                  <Button 
                    type="submit" 
                    disabled={isSubmitting || (sourceType === 'github' && !githubUrl) || (sourceType === 'upload' && !file)}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {isSubmitting ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Starting Build...</>
                    ) : (
                      <><Play className="mr-2 h-4 w-4" /> Start Compilation</>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="status" className="mt-6">
            <Card className="bg-zinc-900 border-zinc-800 text-zinc-100">
              <CardHeader className="flex flex-row items-center justify-between pb-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    Build Status
                    {buildStatus === 'building' && <Badge className="bg-blue-500/20 text-blue-400 hover:bg-blue-500/20 border-blue-500/50">In Progress</Badge>}
                    {buildStatus === 'completed' && <Badge className="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 border-emerald-500/50">Success</Badge>}
                    {buildStatus === 'failed' && <Badge className="bg-red-500/20 text-red-400 hover:bg-red-500/20 border-red-500/50">Failed</Badge>}
                    {buildStatus === 'queued' && <Badge className="bg-zinc-500/20 text-zinc-400 hover:bg-zinc-500/20 border-zinc-500/50">Queued</Badge>}
                  </CardTitle>
                  <CardDescription className="text-zinc-400 mt-1">ID: {buildId}</CardDescription>
                </div>
                {downloadUrl && (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">
                        <Download className="mr-2 h-4 w-4" /> Download {buildType.toUpperCase()}
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-amber-500">
                          <Info className="w-5 h-5" />
                          Simulation Mode Active
                        </DialogTitle>
                        <DialogDescription className="text-zinc-400 pt-2 space-y-3">
                          <p>
                            The APK/AAB you are trying to download is a <strong>simulated placeholder file</strong>. It will not install on a real Android device.
                          </p>
                          <p>
                            Compiling real Android and Flutter applications requires gigabytes of SDKs (Java, Android SDK, Gradle, Flutter) and heavy CPU/RAM usage. This cannot run directly inside this lightweight web preview environment.
                          </p>
                          <p>
                            To generate real, working APKs, you must deploy the backend to a cloud provider (like AWS ECS or GCP Cloud Run) using the <code>Dockerfile</code> provided in the project files.
                          </p>
                        </DialogDescription>
                      </DialogHeader>
                      <DialogFooter className="sm:justify-start">
                        <Button asChild variant="outline" className="bg-zinc-800 border-zinc-700 text-zinc-100 hover:bg-zinc-700 hover:text-white">
                          <a href={downloadUrl} download>
                            Download Placeholder Anyway
                          </a>
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">Progress</span>
                    <span className="font-mono">{buildProgress}%</span>
                  </div>
                  <Progress value={buildProgress} className="h-2 bg-zinc-800" indicatorClassName={buildStatus === 'failed' ? 'bg-red-500' : 'bg-emerald-500'} />
                </div>

                <div className="space-y-2">
                  <Label>Build Logs</Label>
                  <ScrollArea className="h-[400px] w-full rounded-md border border-zinc-800 bg-zinc-950 p-4 font-mono text-sm">
                    {logs.length === 0 ? (
                      <div className="text-zinc-500 italic">Waiting for logs...</div>
                    ) : (
                      <div className="space-y-1">
                        {logs.map((log, i) => (
                          <div key={i} className={`flex gap-3 ${log.type === 'error' ? 'text-red-400' : log.type === 'success' ? 'text-emerald-400' : 'text-zinc-300'}`}>
                            <span className="text-zinc-600 shrink-0">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                            <span className="break-all">{log.message}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
