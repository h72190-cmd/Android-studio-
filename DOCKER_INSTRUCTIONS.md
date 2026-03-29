# CloudBuild - Deployment & Docker Instructions

This document contains the Dockerfile and instructions for deploying the CloudBuild system to AWS or GCP.

## 1. Dockerfile for Build Environment

To run actual builds (instead of the simulation), you need a Docker container that has all the necessary SDKs (Java, Android SDK, Flutter, Node.js).

Create a `Dockerfile` in your backend directory:

```dockerfile
# Use Ubuntu as the base image
FROM ubuntu:22.04

# Set non-interactive mode for apt-get
ENV DEBIAN_FRONTEND=noninteractive

# Install dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    unzip \
    xz-utils \
    zip \
    libglu1-mesa \
    openjdk-17-jdk \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Set Java environment variables
ENV JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
ENV PATH=$JAVA_HOME/bin:$PATH

# Install Android SDK
ENV ANDROID_SDK_ROOT=/opt/android-sdk
RUN mkdir -p ${ANDROID_SDK_ROOT}/cmdline-tools && \
    wget -q https://dl.google.com/android/repository/commandlinetools-linux-10406996_latest.zip -O android_tools.zip && \
    unzip -q android_tools.zip -d ${ANDROID_SDK_ROOT}/cmdline-tools && \
    mv ${ANDROID_SDK_ROOT}/cmdline-tools/cmdline-tools ${ANDROID_SDK_ROOT}/cmdline-tools/latest && \
    rm android_tools.zip

ENV PATH=${ANDROID_SDK_ROOT}/cmdline-tools/latest/bin:${ANDROID_SDK_ROOT}/platform-tools:$PATH

# Accept Android SDK licenses
RUN yes | sdkmanager --licenses

# Install required Android packages
RUN sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"

# Install Flutter
ENV FLUTTER_HOME=/opt/flutter
RUN git clone https://github.com/flutter/flutter.git -b stable ${FLUTTER_HOME}
ENV PATH=${FLUTTER_HOME}/bin:$PATH
RUN flutter precache
RUN flutter config --no-analytics

# Install Node.js (for React Native)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs

# Set working directory
WORKDIR /app

# Copy backend code
COPY package*.json ./
RUN npm install

COPY . .

# Expose port
EXPOSE 3000

# Start the server
CMD ["npm", "start"]
```

## 2. Deployment Instructions

### Option A: Deploying to Google Cloud Run (GCP)

Google Cloud Run is perfect for this because it scales to zero and can run Docker containers. However, since mobile builds can take a long time and require significant memory, you need to configure the service appropriately.

1. **Install Google Cloud SDK** and authenticate:
   ```bash
   gcloud auth login
   gcloud config set project YOUR_PROJECT_ID
   ```

2. **Build and Submit the Docker Image**:
   ```bash
   gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/cloudbuild-app
   ```

3. **Deploy to Cloud Run**:
   ```bash
   gcloud run deploy cloudbuild-app \
     --image gcr.io/YOUR_PROJECT_ID/cloudbuild-app \
     --platform managed \
     --region us-central1 \
     --allow-unauthenticated \
     --memory 8Gi \
     --cpu 4 \
     --timeout 3600
   ```
   *Note: We allocate 8GB RAM and 4 CPUs because Gradle and Flutter builds are resource-intensive. The timeout is set to 1 hour (3600s).*

### Option B: Deploying to AWS Elastic Container Service (ECS) with Fargate

1. **Push Image to Amazon ECR**:
   ```bash
   aws ecr create-repository --repository-name cloudbuild-app
   aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com
   docker build -t cloudbuild-app .
   docker tag cloudbuild-app:latest YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/cloudbuild-app:latest
   docker push YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/cloudbuild-app:latest
   ```

2. **Create an ECS Cluster**:
   - Go to AWS ECS Console -> Create Cluster (Fargate).

3. **Create a Task Definition**:
   - Launch type: Fargate
   - Task memory: 8 GB
   - Task CPU: 4 vCPU
   - Container image: `YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/cloudbuild-app:latest`
   - Port mappings: 3000

4. **Run the Service**:
   - Create a Service in your cluster using the Task Definition.
   - Configure an Application Load Balancer (ALB) to route traffic to port 3000.

## 3. Real Implementation Notes (Beyond Simulation)

In the provided `server.ts`, the build process is simulated. To implement the real build process:

1. **Replace `startSimulatedBuild`** with a function that spawns child processes.
2. **Use `child_process.spawn`** in Node.js to run the actual build commands:
   ```typescript
   import { spawn } from 'child_process';
   
   const buildProcess = spawn('./gradlew', ['assembleRelease'], { cwd: '/path/to/extracted/project' });
   
   buildProcess.stdout.on('data', (data) => {
     emitLog(data.toString());
   });
   
   buildProcess.stderr.on('data', (data) => {
     emitLog(data.toString(), 'error');
   });
   
   buildProcess.on('close', (code) => {
     if (code === 0) emitStatus('completed');
     else emitStatus('failed');
   });
   ```
3. **Security**: Never run user-submitted code directly on the host machine. Always use isolated Docker containers or temporary VMs (like AWS Firecracker) for each build to prevent malicious code execution.
