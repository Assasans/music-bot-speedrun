const Fs = require('promise-fs');
const Path = require('path');

const { PassThrough } = require('stream');
const { spawn, exec } = require('child_process');
const { Client, Intents } = require('discord.js');
const {
	joinVoiceChannel,
	createAudioPlayer,
	createAudioResource,
	entersState,
	StreamType,
	NoSubscriberBehavior,
	VoiceConnectionStatus
} = require('@discordjs/voice');

function execAsync(command) {
	return new Promise((resolve, reject) => {
		exec(command, (error, stdout, stderr) => {
			if(error) return reject(error);
			return resolve({ stdout: stdout, stderr: stderr });
		});
	})
}

(async () => {
	const config = JSON.parse(await Fs.readFile(Path.resolve('config.json'), { encoding: 'utf8' }));

	const client = new Client({
		intents: [
			Intents.FLAGS.GUILDS,
			Intents.FLAGS.GUILD_MEMBERS,
			Intents.FLAGS.GUILD_MESSAGES,
			Intents.FLAGS.GUILD_VOICE_STATES
		]
	});

	client.on('ready', () => {
		const user = client.user;

		console.log(`Logged in: ${user.username}#${user.discriminator}`);
	});

	client.on('messageCreate', async (message) => {
		const guild = message.guild;
		const content = message.content;
		const member = message.member;

		if(!member) return;
		if(!content.startsWith('%')) return;

		const rawArgs = content.slice(1).split(' ');
		const command = rawArgs[0];
		const args = rawArgs.slice(1);

		if(command === 'play') {
			const url = args[0].replace('<', '').replace('>', '');

			const channel = member.voice.channel;
			if(!channel) {
				message.reply('You are not in a voice channel');
				return;
			}

			const connection = joinVoiceChannel({
				guildId: guild.id,
				channelId: channel.id,
				adapterCreator: guild.voiceAdapterCreator
			});

			try {
				await entersState(connection, VoiceConnectionStatus.Ready, 10000);
			} catch (error) {
				connection.destroy();
				throw error;
			}

			const player = createAudioPlayer({
				behaviors: {
					noSubscriber: NoSubscriberBehavior.Play,
					maxMissedFrames: Math.round(5000 / 20),
				}
			});

			connection.subscribe(player);

			// const stream = new PassThrough();

			// let youtubeProcess;
			let ffmpegProcess;
			// for(let i = 0; i < 60; i++) {
				const streams = (await execAsync(`yt-dlp ${encodeURI(url)} --cookies ${Path.resolve('cookies.txt')} --get-url`)).stdout.toString().split('\n');
				const streamUrl = streams[0].endsWith('.m3u8') ? streams[0] : streams[1];

				ffmpegProcess = spawn('ffmpeg', [
					'-hide_banner',
					'-i', streamUrl,
					'-loglevel', 'quiet',
					'-f', 's16le',
					'-ar', '48000',
					'-ac', '2',
					'-b:a', '384k',
					'-threads', '4',
					'pipe:1'
				], {
					stdio: 'pipe'
				});

				ffmpegProcess.stderr.on('data', (chunk) => {
					console.log(chunk.toString());
				});

				// ffmpegProcess.stdout.on('data', (chunk) => {
				// 	const buffer = Buffer.from(chunk);

				// 	// console.log(chunk.toString());
				// 	stream.write(buffer);
				// 	// console.log(`[ffmpeg -> discord.js] Written ${buffer.byteLength} bytes`);
				// });

				// ffmpegProcess.stdout.on('data', (chunk) => {

				// });

				// youtubeProcess.on('exit', (code) => {
				// 	console.log(`[youtube-dl] Exited with exit code ${code}`)
				// });

				ffmpegProcess.on('exit', (code) => {
					console.log(`[ffmpeg] Exited with exit code ${code}`)
				});

				// youtubeProcess.stderr.on('data', (chunk) => {
				// 	console.log(chunk.toString());
				// });
			// }

			// Pipe youtube-dl to ffmpeg
			// youtubeProcess.stdout.on('data', (chunk) => {
			// 	const buffer = Buffer.from(chunk);

			// 	// console.log(chunk.toString());
			// 	ffmpegProcess.stdin.write(buffer);
			// 	// console.log(`[youtube-dl -> ffmpeg] Written ${buffer.byteLength} bytes`);
			// });

			player.on('error', console.error);
			player.on('debug', console.log);

			const resource = createAudioResource(ffmpegProcess.stdout, { inputType: StreamType.Raw });
			player.play(resource);
		}
	});

	client.login(config.token);
})();
