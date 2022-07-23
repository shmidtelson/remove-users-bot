import { TelegramClient} from "telegram";
import { StringSession } from "telegram/sessions";

import {Bot, session} from 'grammy';
import {FileAdapter} from '@grammyjs/storage-file';
import {generateUpdateMiddleware} from 'telegraf-middleware-console-time';
import {html as format} from 'telegram-format';
import {useFluent} from '@grammyjs/fluent';

import {fluent, loadLocales} from '../translation.js';
import {MyContext, Session} from './my-context.js';

import 'dotenv/config'

const stringSessionInstance = new StringSession("");
const token = process.env['BOT_TOKEN'];
const tgApiId: number = parseInt(<string>process.env['TG_API_ID'], 10) || 0;
const tgApiHash = process.env['TG_API_HASH'] || '';

if (!token) {
	throw new Error('You have to provide the bot-token from @BotFather via environment variable (BOT_TOKEN)');
}

const bot = new Bot<MyContext>(token);

bot.use(session({
	initial: (): Session => ({}),
	storage: new FileAdapter(),
}));

bot.use(useFluent({
	defaultLocale: 'en',
	fluent,
	localeNegotiator: ctx => ctx.session.language_code ?? ctx.from?.language_code ?? 'en',
}));

if (process.env['NODE_ENV'] !== 'production') {
	// Show what telegram updates (messages, button clicks, ...) are happening (only in development)
	bot.use(generateUpdateMiddleware());
}

bot.command('removedeletedusers', async ctx => {
	// Check if group
	if (ctx.update.message?.chat.type !== 'supergroup') {
		await ctx.reply('Sorry, but it should be SuperGroup');
		return
	}
	const currentBotId = ctx.me.id
	// Check if admin
	const chatId = ctx.update.message.chat.id
	const userId = ctx.update.message.from.id

	const admins  = await bot.api.getChatAdministrators(chatId)
	const adminIds = admins.map(item => item.user.id)
	const currentBotAdmin = admins.find(item => item.user.id === currentBotId)
	const currentUserAdmin = admins.find(item => item.user.id === userId)

	if (!adminIds.includes(currentBotId)) {
		await ctx.reply('Sorry, but you should add bot to admins and give him ban rights');
		return
	}

	if (!adminIds.includes(userId)) {
		await ctx.reply('Sorry, but only Admins can use this command');
		return
	}

	// @ts-ignore
	if (!currentBotAdmin?.can_restrict_members ) {
		await ctx.reply('Sorry, but you should give bot ban rights');
		return
	}

	const banRights = [
		currentUserAdmin?.status === 'creator',
		// @ts-ignore
		currentUserAdmin?.can_restrict_members
	]

	if (!banRights.includes(true)) {
		await ctx.reply('Sorry, but you should have ban rights');
		return
	}

	// get users
	const client = new TelegramClient(
		stringSessionInstance,
		tgApiId,
		tgApiHash,
		{ connectionRetries: 5 }
	);

	await client.start({
		botAuthToken: token,
	});

	const users = await client.getParticipants(chatId,
	    {
			limit: 0,
		}
	);

	let countDeletedAccounts = 0

	for(let i = 0; i < users.length; i++){
		// @ts-ignore
		if (users[i].deleted) {
			try {
				// @ts-ignore
				await bot.api.banChatMember(chatId, parseInt(users[i].participant.userId))
				countDeletedAccounts += 1
			} catch (e) {
				console.log(e)
			}
		}
	}

	let text = '';
	text += format.bold(`I deleted ${countDeletedAccounts} accounts (Deleted accounts)`);
	text += ' ';
	text += format.spoiler(ctx.match);
	await ctx.reply(text, {parse_mode: format.parse_mode});
});

bot.catch(error => {
	console.error('ERROR on handling update occured', error);
});

export async function start(): Promise<void> {
	await loadLocales();

	// The commands you set here will be shown as /commands like /start or /magic in your telegram client.
	await bot.api.setMyCommands([
		{command: 'removedeletedusers', description: 'Clean deleted users'},
	]);

	await bot.start({
		onStart(botInfo) {
			console.log(new Date(), 'Bot starts as', botInfo.username);
		},
	});
}
