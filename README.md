# Discord Music Bot (yt-dlp)

A powerful Discord music bot that downloads and plays music using yt-dlp, bypassing YouTube's anti-bot measures. Supports YouTube, Spotify, and SoundCloud with automatic file cleanup.

## Features

- 🎵 **Multi-source support**: YouTube, Spotify, and SoundCloud
- 🔍 **Smart search**: Search by song name or use direct links
- 📥 **Download & play**: Downloads audio files and plays them locally
- 🗑️ **Auto-cleanup**: Automatically deletes files after playing
- ⏯️ **Playback controls**: Play, pause, resume, skip, stop
- 🎨 **Rich embeds**: Beautiful help and status displays
- ⚡ **Slash commands**: Modern Discord slash command interface

## How It Works

This bot uses `yt-dlp` to download audio files from YouTube, then plays them locally in Discord voice channels. Files are automatically deleted after playing to save disk space.

## Setup Instructions

### 1. Prerequisites

- Node.js (v16 or higher)
- A Discord application and bot token
- (Optional) Spotify API credentials for enhanced Spotify features
- `yt-dlp` and `ffmpeg` installed on your system

### 2. Install System Dependencies

**On macOS (using Homebrew):**
```bash
brew install yt-dlp ffmpeg
```

**On Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install yt-dlp ffmpeg
```

**On WSL (Windows Subsystem for Linux):**
```bash
sudo apt update
sudo apt install yt-dlp ffmpeg
```

**On Windows:**
- Download yt-dlp from https://github.com/yt-dlp/yt-dlp/releases
- Download ffmpeg from https://ffmpeg.org/download.html
- Add both to your PATH

### 3. Installation

1. Clone or download this project
2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy the environment file and configure it:
   ```bash
   cp env.example .env
   ```

4. Edit `.env` with your credentials:
   ```env
   DISCORD_TOKEN=your_discord_bot_token_here
   DISCORD_CLIENT_ID=your_discord_client_id_here
   SPOTIFY_CLIENT_ID=your_spotify_client_id_here (optional)
   SPOTIFY_CLIENT_SECRET=your_spotify_client_secret_here (optional)
   PREFIX=!
   ```

### 4. Discord Bot Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to the "Bot" section and create a bot
4. Copy the bot token and add it to your `.env` file
5. Copy the Application ID and add it to your `.env` file
6. Enable the following bot permissions:
   - Send Messages
   - Use Slash Commands
   - Connect
   - Speak
   - Use Voice Activity

### 5. Spotify API Setup (Optional)

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create a new app
3. Copy the Client ID and Client Secret to your `.env` file
4. Note: Without Spotify API credentials, Spotify searches will fallback to YouTube

### 6. Running the Bot

```bash
# Development mode (with auto-restart)
npm run dev

# Production mode
npm start
```

## Commands

All commands are slash commands:

- `/play <query> [source]` - Play music from search or URL
- `/pause` - Pause the current song
- `/resume` - Resume the paused song
- `/skip` - Skip to the next song (deletes current file)
- `/stop` - Stop playing and delete current file
- `/queue` - Show the current music queue
- `/volume <level>` - Set volume (0-100)
- `/help` - Show help information

## Usage Examples

### Search by name:
- `/play Never Gonna Give You Up`
- `/play Bohemian Rhapsody source:youtube`
- `/play Shape of You source:spotify`

### Direct links:
- `/play https://www.youtube.com/watch?v=dQw4w9WgXcQ`
- `/play https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh`

## Supported Sources

### YouTube
- Direct video URLs
- Search by song name
- High-quality audio downloads

### Spotify
- Direct track/playlist URLs
- Search by song name (converts to YouTube)
- Requires API setup for search functionality

### SoundCloud
- Direct track URLs
- Search by song name (converts to YouTube)

## File Management

- Audio files are downloaded to a `downloads/` folder
- Files are automatically deleted after playing
- Old files are cleaned up every 10 minutes
- `/stop` and `/skip` commands immediately delete current files

## Troubleshooting

### Common Issues

1. **Bot doesn't respond to commands**
   - Check if the bot has the correct permissions
   - Ensure the bot is online and running
   - Verify the Discord token is correct

2. **Music doesn't play**
   - Make sure you're in a voice channel
   - Check if the bot has permission to join and speak in the voice channel
   - Verify yt-dlp and ffmpeg are installed and accessible

3. **Download errors**
   - Check your internet connection
   - Verify the video URL is accessible
   - Some videos may be region-restricted

4. **Spotify searches not working**
   - Ensure Spotify API credentials are properly configured
   - Check if the Spotify app has the correct permissions

### Dependencies

**Node.js packages:**
- `discord.js` - Discord API wrapper
- `@discordjs/voice` - Voice connection handling
- `@discordjs/opus` - Opus codec for audio
- `spotify-web-api-node` - Spotify API integration
- `ffmpeg-static` - Static FFmpeg binaries
- `dotenv` - Environment variable management

**System dependencies:**
- `yt-dlp` - YouTube audio extraction
- `ffmpeg` - Audio processing

## License

MIT License - feel free to modify and distribute as needed.

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.