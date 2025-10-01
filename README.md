# Discord Music Bot

A powerful Discord bot that can stream music from YouTube, Spotify, and SoundCloud with support for both search by name and direct links.

## Features

- 🎵 **Multi-source support**: YouTube, Spotify, and SoundCloud
- 🔍 **Smart search**: Search by song name or use direct links
- 📋 **Queue system**: Add multiple songs to a queue
- ⏯️ **Playback controls**: Play, pause, resume, skip, stop
- 🔊 **Volume control**: Adjust volume from 0-100%
- 🎨 **Rich embeds**: Beautiful now playing and queue displays
- ⚡ **Slash commands**: Modern Discord slash command interface

## Setup Instructions

### 1. Prerequisites

- Node.js (v16 or higher)
- A Discord application and bot token
- (Optional) Spotify API credentials for enhanced Spotify features

### 2. Installation

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

### 3. Discord Bot Setup

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

### 4. Spotify API Setup (Optional)

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create a new app
3. Copy the Client ID and Client Secret to your `.env` file
4. Note: Without Spotify API credentials, Spotify searches will fallback to YouTube

### 5. YouTube Authentication (Recommended for better reliability)

YouTube has been restricting access for unauthenticated users. For better reliability:

#### Method 1: Official Method (Recommended)
1. Open a new incognito/private window in your browser
2. Log into YouTube in the incognito window
3. Open DevTools (F12)
4. Go to the Network tab
5. Copy the value of the Cookie header from any request to youtube.com
6. Create a file called `cookies.txt` and paste the cookie string there
7. Run the cookie extractor:
   ```bash
   node get-cookies.js
   ```

#### Method 2: EditThisCookie Extension (Alternative)
1. Install [EditThisCookie](https://chrome.google.com/webstore/detail/editthiscookie/fngmhnnpilhplaeedifhccceomclgfbg) browser extension
2. Go to YouTube.com and log in to your account
3. Click the EditThisCookie extension icon
4. Click "Export" to copy cookies to clipboard
5. Create a file called `cookies-raw.txt` and paste the cookies there
6. Run the cookie extractor:
   ```bash
   node get-cookies.js
   ```

**Note**: Without cookies, the bot may have limited access to some YouTube videos.

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
- `/skip` - Skip to the next song
- `/stop` - Stop playing and clear queue
- `/queue` - Show the current music queue
- `/volume <level>` - Set volume (0-100)

## Usage Examples

### Search by name:
- `/play Never Gonna Give You Up`
- `/play Bohemian Rhapsody source:youtube`
- `/play Shape of You source:spotify`

### Direct links:
- `/play https://www.youtube.com/watch?v=dQw4w9WgXcQ`
- `/play https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh`
- `/play https://soundcloud.com/artist/song`

## Supported Sources

### YouTube
- Direct video URLs
- Search by song name
- High-quality audio streaming

### Spotify
- Direct track/playlist URLs
- Search by song name (requires API setup)
- Falls back to YouTube if API not configured

### SoundCloud
- Direct track URLs
- Search by song name
- Native SoundCloud streaming

## Troubleshooting

### Common Issues

1. **Bot doesn't respond to commands**
   - Check if the bot has the correct permissions
   - Ensure the bot is online and running
   - Verify the Discord token is correct

2. **Music doesn't play**
   - Make sure you're in a voice channel
   - Check if the bot has permission to join and speak in the voice channel
   - Verify the audio source URL is valid

3. **Spotify searches not working**
   - Ensure Spotify API credentials are properly configured
   - Check if the Spotify app has the correct permissions

4. **YouTube videos showing as "unavailable"**
   - This is likely due to YouTube's anti-bot measures
   - Set up YouTube authentication using cookies (see step 5 above)
   - The bot will try multiple fallback methods automatically

### Dependencies

- `discord.js` - Discord API wrapper
- `@discordjs/voice` - Voice connection handling
- `ytdl-core` - YouTube audio extraction
- `youtube-sr` - YouTube search
- `spotify-web-api-node` - Spotify API integration
- `soundcloud-scraper` - SoundCloud integration
- `ffmpeg-static` - Audio processing

## License

MIT License - feel free to modify and distribute as needed.

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.
