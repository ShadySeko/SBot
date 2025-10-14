const { Client, GatewayIntentBits, Events, EmbedBuilder, SlashCommandBuilder, REST, Routes } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus, StreamType } = require('@discordjs/voice');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const SpotifyWebApi = require('spotify-web-api-node');
const axios = require('axios');
require('dotenv').config();

const execAsync = promisify(exec);

// Initialize Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// Initialize Spotify API
const spotifyApi = new SpotifyWebApi({
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
});

// Music queues and players
const musicQueues = new Map();
const audioPlayers = new Map();

// Create downloads directory
const downloadsDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
}

const { spawn } = require('child_process');
const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg'; // use system ffmpeg (8.0). Set env to override.

// Replace the getStreamUrl function
async function getStreamUrl(url) {
    try {
        // Get a more reliable stream URL with better format selection
        const command = `yt-dlp --get-url --format "bestaudio[ext=webm][acodec=opus]/bestaudio[ext=m4a]/bestaudio" --no-warnings "${url}"`;
        const { stdout } = await execAsync(command, { timeout: 10000 });
        const streamUrl = stdout.trim();
        
        if (!streamUrl || streamUrl.includes('ERROR')) {
            return null;
        }
        
        return streamUrl;
    } catch (error) {
        console.error('Error getting stream URL:', error);
        return null;
    }
}


// Slash command definitions
const commands = [
    new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play music from YouTube, Spotify, or SoundCloud')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('The song name or URL')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('source')
                .setDescription('Specify the source (youtube, spotify, soundcloud)')
                .setRequired(false)
                .addChoices(
                    { name: 'YouTube', value: 'youtube' },
                    { name: 'Spotify', value: 'spotify' },
                    { name: 'SoundCloud', value: 'soundcloud' }
                )
        ),
    new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Skip the current song'),
    new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Stop playing music and clear the queue'),
    new SlashCommandBuilder()
        .setName('pause')
        .setDescription('Pause the current song'),
    new SlashCommandBuilder()
        .setName('resume')
        .setDescription('Resume the paused song'),
    new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Show the current music queue'),
    new SlashCommandBuilder()
        .setName('volume')
        .setDescription('Set the bot\'s volume')
        .addIntegerOption(option =>
            option.setName('level')
                .setDescription('Volume level (0-100)')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(100)
        ),
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show help information and available commands')
];

// Register slash commands
async function registerCommands() {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    
    try {
        console.log('Started refreshing application (/) commands.');
        await rest.put(
            Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
            { body: commands }
        );
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
}

// YouTube search function
async function searchYouTube(query) {
    try {
        // Use yt-dlp to search and get video info with JSON output
        const command = `yt-dlp --dump-json "ytsearch1:${query}"`;
        const { stdout } = await execAsync(command);
        const lines = stdout.trim().split('\n');
        
        if (lines.length > 0) {
            const videoInfo = JSON.parse(lines[0]);
            
            if (videoInfo && videoInfo.id && videoInfo.title) {
                const youtubeUrl = `https://www.youtube.com/watch?v=${videoInfo.id}`;
                
                return {
                    title: videoInfo.title,
                    url: youtubeUrl,
                    duration: videoInfo.duration ? `${Math.floor(videoInfo.duration / 60)}:${(videoInfo.duration % 60).toString().padStart(2, '0')}` : 'Unknown'
                };
            }
        }
        return null;
    } catch (error) {
        console.error('YouTube search error:', error);
        return null;
    }
}

// Spotify search function
async function searchSpotify(query) {
    try {
        const token = await spotifyApi.clientCredentialsGrant();
        spotifyApi.setAccessToken(token.body.access_token);
        
        const data = await spotifyApi.searchTracks(query, { limit: 1 });
        const track = data.body.tracks.items[0];
        
        if (track) {
            // Search YouTube for the Spotify track
            const youtubeQuery = `${track.name} ${track.artists[0].name}`;
            return await searchYouTube(youtubeQuery);
        }
        return null;
    } catch (error) {
        console.error('Spotify search error:', error);
        return null;
    }
}

// Download audio using yt-dlp
async function downloadAudio(url, filename) {
    try {
        const filepath = path.join(downloadsDir, `${filename}.mp3`);
        const command = `yt-dlp --extract-audio --audio-format mp3 --audio-quality 0 --no-playlist --ignore-errors --no-warnings "${url}" --output "${filepath}"`;
        
        console.log(`Downloading: ${url}`);
        console.log(`Saving to: ${filepath}`);
        
        await execAsync(command);
        
        // Check if file was created
        if (fs.existsSync(filepath)) {
            const stats = fs.statSync(filepath);
            console.log(`✅ Download successful: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
            return filepath;
        }
        
        // Try alternative approach if MP3 failed
        console.log('MP3 conversion failed, trying alternative format...');
        const altFilepath = path.join(downloadsDir, `${filename}.webm`);
        const altCommand = `yt-dlp --extract-audio --audio-format webm --no-playlist --ignore-errors --no-warnings "${url}" --output "${altFilepath}"`;
        
        await execAsync(altCommand);
        
        if (fs.existsSync(altFilepath)) {
            const stats = fs.statSync(altFilepath);
            console.log(`✅ Download successful (WebM): ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
            return altFilepath;
        }
        
        console.log('❌ Download failed: No file created');
        return null;
    } catch (error) {
        console.error('Download error:', error.message);
        return null;
    }
}

// Clean up old files
function cleanupOldFiles() {
    try {
        const files = fs.readdirSync(downloadsDir);
        const now = Date.now();
        const maxAge = 30 * 60 * 1000; // 30 minutes
        
        files.forEach(file => {
            const filepath = path.join(downloadsDir, file);
            const stats = fs.statSync(filepath);
            
            if (now - stats.mtime.getTime() > maxAge) {
                fs.unlinkSync(filepath);
                console.log(`Cleaned up old file: ${file}`);
            }
        });
    } catch (error) {
        console.error('Cleanup error:', error);
    }
}


// Uncomment and modify the playAudio function
async function playAudio(interaction, filepath) {
    try {
        const voiceChannel = interaction.member.voice.channel;
        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: interaction.guild.id,
            adapterCreator: interaction.guild.voiceAdapterCreator,
        });

        const player = createAudioPlayer();
        const resource = createAudioResource(filepath, {
            inlineVolume: true,
            bufferingTimeout: 7000
        });
        
        player.play(resource);
        connection.subscribe(player);
        
        // Store player for this guild (include filepath for cleanup)
        audioPlayers.set(interaction.guild.id, { 
            player, 
            connection, 
            filepath,
            title: 'Downloaded Audio' // Add a default title
        });
        
        // Clean up when finished
        player.on(AudioPlayerStatus.Idle, () => {
            console.log('Audio finished playing');
            if (fs.existsSync(filepath)) {
                fs.unlinkSync(filepath);
                console.log(`Deleted file: ${filepath}`);
            }
            connection.destroy();
            audioPlayers.delete(interaction.guild.id);
        });
        
        player.on('error', error => {
            console.error('Audio player error:', error);
            if (fs.existsSync(filepath)) {
                fs.unlinkSync(filepath);
            }
            connection.destroy();
            audioPlayers.delete(interaction.guild.id);
        });
        
        return true;
    } catch (error) {
        console.error('Play audio error:', error);
        return false;
    }
}


// Replace the playAudioStream function with better error handling
async function playAudioStream(interaction, url, title, connection) {
    try {
        const streamUrl = await getStreamUrl(url);
        if (!streamUrl || !(await isStreamUrlValid(streamUrl))) {
            throw new Error('Invalid stream URL');
        }

        // Create FFmpeg process for streaming
        const ffmpeg = spawn('ffmpeg', [
            '-i', streamUrl,
            '-f', 's16le',
            '-ar', '48000',
            '-ac', '2',
            '-loglevel', 'error',
            '-bufsize', '256k',  // Increased buffer size
            '-timeout', '5000000', // Increased timeout
            '-'
        ]);

        let streamStarted = false;
        let streamError = false;

        // Monitor FFmpeg for errors
        ffmpeg.stderr.on('data', (data) => {
            const errorMsg = data.toString();
            console.error(`FFmpeg stderr: ${errorMsg}`);
            
            // Check for critical errors that should trigger fallback
            if (errorMsg.includes('Error in the pull function') || 
                errorMsg.includes('Read error') || 
                errorMsg.includes('session has been invalidated') ||
                errorMsg.includes('Input/output error')) {
                streamError = true;
                console.log('🚨 Critical streaming error detected, will use fallback');
            }
        });

        ffmpeg.on('error', (error) => {
            console.error('FFmpeg process error:', error);
            streamError = true;
        });

        // Give FFmpeg a moment to start and check for immediate errors
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                if (streamError) {
                    reject(new Error('FFmpeg stream failed to start'));
                } else {
                    streamStarted = true;
                    resolve();
                }
            }, 2000); // Wait 2 seconds for stream to stabilize

            ffmpeg.on('error', () => {
                clearTimeout(timeout);
                reject(new Error('FFmpeg error during startup'));
            });
        });

        const player = createAudioPlayer();
        const resource = createAudioResource(ffmpeg.stdout, {
            inputType: 'raw',
            inlineVolume: true
        });
        
        player.play(resource);
        connection.subscribe(player);
        
        // Store player for this guild
        audioPlayers.set(interaction.guild.id, { 
            player, 
            connection, 
            ffmpeg,
            title 
        });
        
        // Clean up when finished
        player.on(AudioPlayerStatus.Idle, () => {
            console.log('Audio finished playing');
            if (ffmpeg && !ffmpeg.killed) {
                ffmpeg.kill('SIGKILL');
            }
            connection.destroy();
            audioPlayers.delete(interaction.guild.id);
        });
        
        player.on('error', error => {
            console.error('Audio player error:', error);
            if (ffmpeg && !ffmpeg.killed) {
                ffmpeg.kill('SIGKILL');
            }
            connection.destroy();
            audioPlayers.delete(interaction.guild.id);
        });
        
        return true;
    } catch (error) {
        console.error('Play audio stream error:', error);
        return false;
    }
}


// Stream via yt-dlp piping into ffmpeg (more resilient than FFmpeg pulling googlevideo directly)
async function playAudioStreamViaYtDlp(interaction, url, title, connection) {
    try {
        const ytdlpCmd = process.env.YTDLP_PATH || 'yt-dlp';

        const ytdlp = spawn(ytdlpCmd, [
            '-o', '-',                         // write media to stdout
            '--no-playlist',
            '--quiet', '--no-warnings',
            '--retries', 'infinite',
            '--fragment-retries', 'infinite',
            '--http-chunk-size', '1M',         // range requests help with flaky CDNs
            '--geo-bypass',
            '--force-ipv4',                    // avoids some IPv6 edge-cases
            '-f', 'bestaudio[acodec=opus]/bestaudio[ext=m4a]/bestaudio',
            // '--extractor-args', 'youtube:player_client=android', // optional: often more stable
            url
        ], { stdio: ['ignore', 'pipe', 'pipe'] });

        const ffmpeg = spawn(ffmpegPath, [
            '-loglevel', 'warning',
            '-i', 'pipe:0',
            '-f', 's16le',
            '-ar', '48000',
            '-ac', '2',
            'pipe:1'
        ], { stdio: ['pipe', 'pipe', 'pipe'] });

        // Pipe yt-dlp -> ffmpeg
        ytdlp.stdout.pipe(ffmpeg.stdin);

        const player = createAudioPlayer();
        const resource = createAudioResource(ffmpeg.stdout, {
            inputType: StreamType.Raw,
            inlineVolume: true
        });

        player.play(resource);
        connection.subscribe(player);

        // Track processes for cleanup
        audioPlayers.set(interaction.guild.id, {
            player, connection, ffmpeg, ytdlp, title
        });

        ytdlp.stderr.on('data', d => console.error(`yt-dlp: ${d.toString()}`));
        ffmpeg.stderr.on('data', d => console.error(`ffmpeg: ${d.toString()}`));

        const cleanup = () => {
            try { if (ytdlp && !ytdlp.killed) ytdlp.kill('SIGKILL'); } catch {}
            try { if (ffmpeg && !ffmpeg.killed) ffmpeg.kill('SIGKILL'); } catch {}
            try { connection.destroy(); } catch {}
            audioPlayers.delete(interaction.guild.id);
        };

        player.on(AudioPlayerStatus.Idle, cleanup);
        player.on('error', err => { console.error('player error:', err); cleanup(); });

        ytdlp.on('close', code => {
            if (code !== 0) console.error(`yt-dlp exited with code ${code}`);
        });

        return true;
    } catch (e) {
        console.error('playAudioStreamViaYtDlp error:', e);
        return false;
    }
}

// Hybrid: try streaming via yt-dlp->ffmpeg, fallback to download+file playback
async function playAudioHybrid(interaction, url, title) {
    try {
        const voiceChannel = interaction.member.voice.channel;
        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: interaction.guild.id,
            adapterCreator: interaction.guild.voiceAdapterCreator
        });

        const ok = await playAudioStreamViaYtDlp(interaction, url, title, connection);
        if (ok) return true;

        // Fallback: download then play from file (requires downloadAudio and playAudio functions)
        const filename = `song_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const filepath = await downloadAudio(url, filename);
        if (!filepath) return false;
        return await playAudio(interaction, filepath);
    } catch (err) {
        console.error('Hybrid play error:', err);
        return false;
    }
}


// Event handlers
client.once(Events.ClientReady, () => {
    console.log(`Ready! Logged in as ${client.user.tag}`);
    registerCommands();
    
    // Clean up old files every 10 minutes
    setInterval(cleanupOldFiles, 10 * 60 * 1000);
});

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, guildId } = interaction;
    const voiceChannel = interaction.member.voice.channel;
    const textChannel = interaction.channel;

    if (!voiceChannel) {
        return interaction.reply('❌ You need to be in a voice channel to play music!');
    }

    const permissions = voiceChannel.permissionsFor(client.user);
    if (!permissions.has('Connect') || !permissions.has('Speak')) {
        return interaction.reply('❌ I need the permissions to join and speak in your voice channel!');
    }

    switch (commandName) {
        case 'play': {
            try {
                await interaction.deferReply();
                const query = options.getString('query');
                const source = options.getString('source') || 'youtube';

                let searchResult = null;
                if (source === 'spotify' || query.includes('open.spotify.com')) {
                    searchResult = await searchSpotify(query);
                } else if (query.includes('youtube.com') || query.includes('youtu.be')) {
                    searchResult = { url: query, title: 'YouTube Video', duration: 'Unknown' };
                } else {
                    searchResult = await searchYouTube(query);
                }

                if (!searchResult) {
                    return interaction.editReply('❌ No results found for your search.');
                }

                await interaction.editReply(`🔄 Loading: **${searchResult.title}**...`);
                const success = await playAudioHybrid(interaction, searchResult.url, searchResult.title);
                if (!success) return interaction.editReply('❌ Failed to play audio.');

                const d = audioPlayers.get(interaction.guild.id);
                const method = d && d.ytdlp ? '🌐 Streaming' : '💾 Downloaded';
                return interaction.editReply(`🎵 Now playing: **${searchResult.title}** (${method})`);
            } catch (e) {
                console.error('Play error:', e);
                if (interaction.deferred) return interaction.editReply(`❌ ${e.message}`);
                return interaction.reply(`❌ ${e.message}`);
            }
            break;
        }

        case 'skip': {
            const d = audioPlayers.get(interaction.guild.id);
            if (!d) return interaction.reply('❌ No music is currently playing.');
            try { if (d.ytdlp && !d.ytdlp.killed) d.ytdlp.kill('SIGKILL'); } catch {}
            try { if (d.ffmpeg && !d.ffmpeg.killed) d.ffmpeg.kill('SIGKILL'); } catch {}
            d.player.stop();
            return interaction.reply('⏭️ Skipping song...');
        }

        case 'stop': {
            const d = audioPlayers.get(interaction.guild.id);
            if (!d) return interaction.reply('❌ No music is currently playing.');
            try { if (d.ytdlp && !d.ytdlp.killed) d.ytdlp.kill('SIGKILL'); } catch {}
            try { if (d.ffmpeg && !d.ffmpeg.killed) d.ffmpeg.kill('SIGKILL'); } catch {}
            d.player.stop();
            d.connection.destroy();
            audioPlayers.delete(interaction.guild.id);
            return interaction.reply('⏹️ Music stopped!');
        }

        case 'pause': {
            const playerData = audioPlayers.get(interaction.guild.id);
            if (!playerData || !playerData.player) {
                return interaction.reply('❌ No music is currently playing.');
            }
            playerData.player.pause();
            interaction.reply('⏸️ Music paused.');
            break;
        }

        case 'resume': {
            const playerData = audioPlayers.get(interaction.guild.id);
            if (!playerData || !playerData.player) {
                return interaction.reply('❌ No music is currently playing.');
            }
            playerData.player.unpause();
            interaction.reply('▶️ Music resumed.');
            break;
        }

        case 'queue': {
            interaction.reply('❌ Queue functionality not implemented yet. This bot plays one song at a time.');
            break;
        }

        case 'volume': {
            interaction.reply('❌ Volume control not implemented yet.');
            break;
        }

        case 'help': {
            const helpEmbed = new EmbedBuilder()
                .setTitle('🎵Music Bot Help')
                .setDescription('A Discord music bot that downloads and plays music using yt-dlp! Ca va vous? Moi oui.')
                .setColor(0x00ff00)
                .setThumbnail(client.user.displayAvatarURL())
                .addFields(
                    {
                        name: '🎵 Music Commands',
                        value: '`/play <query> [source]` - Play music from search or URL\n`/pause` - Pause the current song\n`/resume` - Resume the paused song\n`/skip` - Skip to the next song\n`/stop` - Stop playing music',
                        inline: false
                    },
                    {
                        name: '🎯 Supported Sources',
                        value: '**YouTube** - Direct URLs and search by name\n**Spotify** - Search by name/URL (converts to YouTube for streaming)\n**SoundCloud** - URLs fallback to YouTube search\n**Auto-detect** - Automatically detects source from URL',
                        inline: false
                    },
                    {
                        name: '💡 Usage Examples',
                        value: '`/play Never Gonna Give You Up`\n`/play https://youtube.com/watch?v=dQw4w9WgXcQ`\n`/play Bohemian Rhapsody source:spotify`\n`/play https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh`',
                        inline: false
                    },
                    {
                        name: '⚙️ How It Works',
                        value: '• Downloads audio using yt-dlp\n• Plays local MP3 files\n• Automatically deletes files after playing\n• Cleans up old files every 10 minutes',
                        inline: false
                    }
                )
                .setFooter({ text: 'T\'as lu jusque la batard?' })
                .setTimestamp();
            interaction.reply({ embeds: [helpEmbed] });
            break;
        }

        default: {
            interaction.reply('❌ Unknown command.');
            break;
        }
    }
});

// Check if the stream URL is valid
async function isStreamUrlValid(url) {
    try {
        const response = await axios.head(url, { timeout: 5000 });
        return response.status === 200;
    } catch (error) {
        console.error('Stream URL validation error:', error.message);
        return false;
    }
}

client.login(process.env.DISCORD_TOKEN);
