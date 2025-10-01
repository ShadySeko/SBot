const { Client, GatewayIntentBits, Events, EmbedBuilder, SlashCommandBuilder, REST, Routes } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus } = require('@discordjs/voice');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const SpotifyWebApi = require('spotify-web-api-node');
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

// Play audio file
async function playAudio(interaction, filepath) {
    try {
        const voiceChannel = interaction.member.voice.channel;
        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: interaction.guild.id,
            adapterCreator: interaction.guild.voiceAdapterCreator,
        });

        const player = createAudioPlayer();
        const resource = createAudioResource(filepath);
        
        player.play(resource);
        connection.subscribe(player);
        
        // Store player for this guild
        audioPlayers.set(interaction.guild.id, { player, connection, filepath });
        
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
                
                // Search based on source
                if (source === 'spotify' || query.includes('open.spotify.com')) {
                    searchResult = await searchSpotify(query);
                } else if (query.includes('youtube.com') || query.includes('youtu.be')) {
                    // Direct YouTube URL
                    searchResult = { url: query, title: 'YouTube Video', duration: 'Unknown' };
                } else {
                    // Default to YouTube search
                    searchResult = await searchYouTube(query);
                }
                
                if (!searchResult) {
                    return interaction.editReply('❌ No results found for your search.');
                }
                
                // Generate filename
                const filename = `song_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                
                // Download audio
                const filepath = await downloadAudio(searchResult.url, filename);
                if (!filepath) {
                    return interaction.editReply('❌ Failed to download audio.');
                }
                
                // Play audio
                const success = await playAudio(interaction, filepath);
                if (!success) {
                    return interaction.editReply('❌ Failed to play audio.');
                }
                
                interaction.editReply(`🎵 Now playing: **${searchResult.title}**`);
                
            } catch (error) {
                console.error('Play error:', error);
                try {
                    if (interaction.deferred) {
                        await interaction.editReply(`❌ An error occurred: ${error.message}`);
                    } else {
                        await interaction.reply(`❌ An error occurred: ${error.message}`);
                    }
                } catch (replyError) {
                    console.error('Failed to send error reply:', replyError);
                }
            }
            break;
        }

        case 'skip': {
            const playerData = audioPlayers.get(interaction.guild.id);
            if (!playerData || !playerData.player) {
                return interaction.reply('❌ No music is currently playing.');
            }
            
            // Delete the current file before skipping
            if (playerData.filepath && fs.existsSync(playerData.filepath)) {
                try {
                    fs.unlinkSync(playerData.filepath);
                    console.log(`🗑️ Deleted file (skip): ${playerData.filepath}`);
                } catch (error) {
                    console.error('Error deleting file:', error);
                }
            }
            
            playerData.player.stop();
            interaction.reply('⏭️ Skipping song...');
            break;
        }

        case 'stop': {
            const playerData = audioPlayers.get(interaction.guild.id);
            if (!playerData || !playerData.player) {
                return interaction.reply('❌ No music is currently playing.');
            }
            
            // Stop the player and destroy connection
            playerData.player.stop();
            playerData.connection.destroy();
            
            // Delete the audio file if it exists
            if (playerData.filepath && fs.existsSync(playerData.filepath)) {
                try {
                    fs.unlinkSync(playerData.filepath);
                    console.log(`🗑️ Deleted file: ${playerData.filepath}`);
                } catch (error) {
                    console.error('Error deleting file:', error);
                }
            }
            
            // Remove from audioPlayers map
            audioPlayers.delete(interaction.guild.id);
            interaction.reply('⏹️ Music stopped and file deleted!');
            break;
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
                .setTitle('🎵 yt-dlp Music Bot Help')
                .setDescription('A Discord music bot that downloads and plays music using yt-dlp!')
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
                        value: '• Downloads audio using yt-dlp (bypasses YouTube restrictions)\n• Plays local MP3 files\n• Automatically deletes files after playing\n• Cleans up old files every 10 minutes',
                        inline: false
                    }
                )
                .setFooter({ text: 'Made with ❤️ and yt-dlp' })
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

client.login(process.env.DISCORD_TOKEN);
