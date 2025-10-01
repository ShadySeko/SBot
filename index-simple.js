const { Client, GatewayIntentBits, Events, EmbedBuilder, SlashCommandBuilder, REST, Routes } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus, entersState } = require('@discordjs/voice');
const ytdl = require('ytdl-core');
const { YouTube } = require('youtube-sr');
const SpotifyWebApi = require('spotify-web-api-node');
require('dotenv').config();

// Initialize Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent
    ]
});

// Initialize Spotify API (optional)
const spotifyApi = new SpotifyWebApi({
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
});

// Music queue and player management
const musicQueues = new Map();
const audioPlayers = new Map();

class MusicQueue {
    constructor(guildId, voiceChannel, textChannel) {
        this.guildId = guildId;
        this.voiceChannel = voiceChannel;
        this.textChannel = textChannel;
        this.songs = [];
        this.currentSong = null;
        this.isPlaying = false;
        this.isPaused = false;
        this.volume = 0.5;
    }

    addSong(song) {
        this.songs.push(song);
    }

    getNextSong() {
        return this.songs.shift();
    }

    clear() {
        this.songs = [];
        this.currentSong = null;
        this.isPlaying = false;
        this.isPaused = false;
    }
}

// Utility functions for different music sources
class MusicSourceHandler {
    static async searchYouTube(query) {
        try {
            const results = await YouTube.search(query, { limit: 5, type: 'video' });
            return results.map(video => ({
                title: video.title,
                url: video.url,
                duration: video.durationFormatted,
                thumbnail: video.thumbnail?.url,
                source: 'youtube'
            }));
        } catch (error) {
            console.error('YouTube search error:', error);
            return [];
        }
    }

    static async searchSpotify(query) {
        try {
            if (!process.env.SPOTIFY_CLIENT_ID) {
                // Fallback to YouTube search if Spotify API not configured
                return await this.searchYouTube(query);
            }

            const token = await spotifyApi.clientCredentialsGrant();
            spotifyApi.setAccessToken(token.body.access_token);

            const data = await spotifyApi.searchTracks(query, { limit: 5 });
            const tracks = data.body.tracks.items;

            return tracks.map(track => ({
                title: track.name,
                artist: track.artists[0].name,
                url: track.external_urls.spotify,
                duration: this.formatDuration(track.duration_ms),
                thumbnail: track.album.images[0]?.url,
                source: 'spotify',
                // For actual playback, we'll search YouTube for the track
                searchQuery: `${track.name} ${track.artists[0].name}`
            }));
        } catch (error) {
            console.error('Spotify search error:', error);
            return await this.searchYouTube(query);
        }
    }

    static async searchSoundCloud(query) {
        // Since soundcloud-scraper is problematic, we'll use YouTube as fallback
        console.log('SoundCloud search falling back to YouTube');
        return await this.searchYouTube(query);
    }

    static formatDuration(ms) {
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    static async getStreamUrl(song) {
        try {
            if (song.source === 'spotify' && song.searchQuery) {
                // For Spotify, search YouTube for the actual audio
                const youtubeResults = await this.searchYouTube(song.searchQuery);
                if (youtubeResults.length > 0) {
                    song = { ...song, ...youtubeResults[0] };
                }
            }

            if (song.source === 'youtube' || song.source === 'spotify') {
                const stream = ytdl(song.url, {
                    filter: 'audioonly',
                    quality: 'highestaudio',
                    highWaterMark: 1 << 25
                });
                return stream;
            } else if (song.source === 'soundcloud') {
                // For SoundCloud, try to search YouTube for the same track
                const youtubeResults = await this.searchYouTube(song.title);
                if (youtubeResults.length > 0) {
                    const stream = ytdl(youtubeResults[0].url, {
                        filter: 'audioonly',
                        quality: 'highestaudio',
                        highWaterMark: 1 << 25
                    });
                    return stream;
                }
                throw new Error('Could not find audio for SoundCloud track');
            }
        } catch (error) {
            console.error('Error getting stream URL:', error);
            throw error;
        }
    }
}

// Music player functions
async function playMusic(guildId) {
    const queue = musicQueues.get(guildId);
    if (!queue || queue.songs.length === 0) {
        queue.isPlaying = false;
        return;
    }

    const song = queue.getNextSong();
    queue.currentSong = song;
    queue.isPlaying = true;
    queue.isPaused = false;

    try {
        const connection = joinVoiceChannel({
            channelId: queue.voiceChannel.id,
            guildId: queue.guildId,
            adapterCreator: queue.voiceChannel.guild.voiceAdapterCreator,
        });

        const player = createAudioPlayer();
        audioPlayers.set(guildId, player);

        // Get audio stream
        const streamUrl = await MusicSourceHandler.getStreamUrl(song);
        const resource = createAudioResource(streamUrl);
        
        player.play(resource);
        connection.subscribe(player);

        // Send now playing embed
        const embed = new EmbedBuilder()
            .setTitle('🎵 Now Playing')
            .setDescription(`**${song.title}**`)
            .setColor(0x00ff00)
            .setThumbnail(song.thumbnail || null);

        if (song.artist) {
            embed.addFields({ name: 'Artist', value: song.artist, inline: true });
        }
        if (song.duration) {
            embed.addFields({ name: 'Duration', value: song.duration, inline: true });
        }
        embed.addFields({ name: 'Source', value: song.source, inline: true });

        await queue.textChannel.send({ embeds: [embed] });

        // Handle player events
        player.on(AudioPlayerStatus.Idle, () => {
            playMusic(guildId);
        });

        player.on('error', error => {
            console.error('Audio player error:', error);
            queue.textChannel.send('❌ An error occurred while playing the music.');
            playMusic(guildId);
        });

    } catch (error) {
        console.error('Error playing music:', error);
        queue.textChannel.send('❌ Could not play the requested song.');
        playMusic(guildId);
    }
}

// Slash commands
const commands = [
    new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play music from YouTube, Spotify, or SoundCloud')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('Song name or URL to play')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('source')
                .setDescription('Music source')
                .setRequired(false)
                .addChoices(
                    { name: 'YouTube', value: 'youtube' },
                    { name: 'Spotify', value: 'spotify' },
                    { name: 'SoundCloud', value: 'soundcloud' },
                    { name: 'Auto-detect', value: 'auto' }
                )
        ),

    new SlashCommandBuilder()
        .setName('pause')
        .setDescription('Pause the current song'),

    new SlashCommandBuilder()
        .setName('resume')
        .setDescription('Resume the paused song'),

    new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Skip the current song'),

    new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Stop playing and clear the queue'),

    new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Show the current music queue'),

    new SlashCommandBuilder()
        .setName('volume')
        .setDescription('Set the volume (0-100)')
        .addIntegerOption(option =>
            option.setName('level')
                .setDescription('Volume level (0-100)')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(100)
        )
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

// Event handlers
client.once(Events.ClientReady, () => {
    console.log(`Ready! Logged in as ${client.user.tag}`);
    registerCommands();
});

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, member, guild } = interaction;

    // Check if user is in a voice channel
    if (['play', 'pause', 'resume', 'skip', 'stop', 'queue', 'volume'].includes(commandName)) {
        if (!member.voice.channel) {
            return interaction.reply('❌ You need to be in a voice channel to use music commands!');
        }
    }

    try {
        switch (commandName) {
            case 'play': {
                const query = options.getString('query');
                const source = options.getString('source') || 'auto';

                await interaction.deferReply();

                // Detect source from URL if auto-detect
                let detectedSource = source;
                if (source === 'auto') {
                    if (query.includes('youtube.com') || query.includes('youtu.be')) {
                        detectedSource = 'youtube';
                    } else if (query.includes('spotify.com')) {
                        detectedSource = 'spotify';
                    } else if (query.includes('soundcloud.com')) {
                        detectedSource = 'soundcloud';
                    } else {
                        detectedSource = 'youtube'; // Default to YouTube for text searches
                    }
                }

                // Search for music
                let results = [];
                switch (detectedSource) {
                    case 'youtube':
                        results = await MusicSourceHandler.searchYouTube(query);
                        break;
                    case 'spotify':
                        results = await MusicSourceHandler.searchSpotify(query);
                        break;
                    case 'soundcloud':
                        results = await MusicSourceHandler.searchSoundCloud(query);
                        break;
                }

                if (results.length === 0) {
                    return interaction.editReply('❌ No results found for your search.');
                }

                // Get or create music queue
                let queue = musicQueues.get(guild.id);
                if (!queue) {
                    queue = new MusicQueue(guild.id, member.voice.channel, interaction.channel);
                    musicQueues.set(guild.id, queue);
                }

                // Add song to queue
                const song = results[0];
                queue.addSong(song);

                const embed = new EmbedBuilder()
                    .setTitle('🎵 Added to Queue')
                    .setDescription(`**${song.title}**`)
                    .setColor(0x00ff00)
                    .setThumbnail(song.thumbnail || null);

                if (song.artist) {
                    embed.addFields({ name: 'Artist', value: song.artist, inline: true });
                }
                if (song.duration) {
                    embed.addFields({ name: 'Duration', value: song.duration, inline: true });
                }
                embed.addFields({ name: 'Source', value: song.source, inline: true });

                await interaction.editReply({ embeds: [embed] });

                // Start playing if not already playing
                if (!queue.isPlaying) {
                    playMusic(guild.id);
                }
                break;
            }

            case 'pause': {
                const player = audioPlayers.get(guild.id);
                if (player && player.state.status === AudioPlayerStatus.Playing) {
                    player.pause();
                    musicQueues.get(guild.id).isPaused = true;
                    interaction.reply('⏸️ Music paused.');
                } else {
                    interaction.reply('❌ No music is currently playing.');
                }
                break;
            }

            case 'resume': {
                const player = audioPlayers.get(guild.id);
                if (player && player.state.status === AudioPlayerStatus.Paused) {
                    player.unpause();
                    musicQueues.get(guild.id).isPaused = false;
                    interaction.reply('▶️ Music resumed.');
                } else {
                    interaction.reply('❌ No music is currently paused.');
                }
                break;
            }

            case 'skip': {
                const player = audioPlayers.get(guild.id);
                if (player) {
                    player.stop();
                    interaction.reply('⏭️ Skipped current song.');
                } else {
                    interaction.reply('❌ No music is currently playing.');
                }
                break;
            }

            case 'stop': {
                const player = audioPlayers.get(guild.id);
                if (player) {
                    player.stop();
                }
                const queue = musicQueues.get(guild.id);
                if (queue) {
                    queue.clear();
                }
                interaction.reply('⏹️ Stopped playing and cleared queue.');
                break;
            }

            case 'queue': {
                const queue = musicQueues.get(guild.id);
                if (!queue || queue.songs.length === 0) {
                    return interaction.reply('❌ The queue is empty.');
                }

                const embed = new EmbedBuilder()
                    .setTitle('🎵 Music Queue')
                    .setColor(0x00ff00);

                let description = '';
                if (queue.currentSong) {
                    description += `**Now Playing:** ${queue.currentSong.title}\n\n`;
                }

                if (queue.songs.length > 0) {
                    description += '**Up Next:**\n';
                    queue.songs.slice(0, 10).forEach((song, index) => {
                        description += `${index + 1}. ${song.title}\n`;
                    });
                    if (queue.songs.length > 10) {
                        description += `... and ${queue.songs.length - 10} more songs`;
                    }
                }

                embed.setDescription(description);
                interaction.reply({ embeds: [embed] });
                break;
            }

            case 'volume': {
                const volume = options.getInteger('level') / 100;
                const queue = musicQueues.get(guild.id);
                if (queue) {
                    queue.volume = volume;
                    interaction.reply(`🔊 Volume set to ${options.getInteger('level')}%`);
                } else {
                    interaction.reply('❌ No music queue found.');
                }
                break;
            }
        }
    } catch (error) {
        console.error('Command error:', error);
        const errorMessage = '❌ An error occurred while processing your command.';
        if (interaction.deferred) {
            interaction.editReply(errorMessage);
        } else {
            interaction.reply(errorMessage);
        }
    }
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN);
