# NetPod - Privacy-Preserving Personalized Movie Recommendation System

NetPod is a privacy-preserving personalized movie recommendation application that utilizes a 5-step Retrieval-Augmented Generation (RAG) flow to provide verified movie recommendations. The system retrieves candidate movies from the TMDB API, uses personal data stored in Solid Pods to personalize recommendations, and utilizes Google Gemini to select relevant movies while keeping personal data decentralized.

## Architecture Overview

The recommendation pipeline follows a strict 5-step RAG flow:

1. **RETRIEVE** - Retrieve candidate movies from the TMDB API based on user genres, liked actors, and vibe keywords.

2. **AUGMENT** - Build a constrained prompt containing the candidate movie pool, user profile, and viewing history retrieved from the user's Solid Pod.

3. **GENERATE** - Send the prompt to Google Gemini to select exactly 5 movies from the retrieved candidate movies.

4. **VALIDATE** - Verify every Gemini recommendation against the retrieved movie data to eliminate hallucinated movies.

5. **ENRICH** - Fetch movie posters, trailers, and additional movie information from the TMDB API.

## Tech Stack

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS

- **Backend**: Next.js API Routes

- **Movie Data**: TMDB API

- **LLM**: Google Gemini

- **Identity & Personal Data Storage**: Solid Protocol (Inrupt SDK)

## Prerequisites

Before starting the installation, ensure your system meets the following requirements:

- Node.js v18.x or higher (v20.x LTS is recommended)

- npm v9.x or higher

- Python v3.11 or v3.12 (required for compiling native modules)

- Git

**Important Note on Python**: Python 3.14 is experimental and causes compilation errors with native modules. Use Python 3.12 for stable builds.

You can verify your installations by running the following commands in your terminal:

```bash
node --version

npm --version

python3 --version

git --version