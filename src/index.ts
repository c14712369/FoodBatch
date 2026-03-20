import 'dotenv/config';
import { Client, Collection, Events, GatewayIntentBits } from 'discord.js';
import { REST, Routes } from 'discord.js';
import { config } from './config.js';
import { bootstrapSheet } from './services/sheets.js';
import { startScheduler } from './scheduler.js';
import * as searchCmd from './commands/search.js';
import * as queryCmd from './commands/query.js';
import * as syncCmd from './commands/sync.js';

const commands = [searchCmd, queryCmd, syncCmd];

async function registerCommands() {
  const rest = new REST().setToken(config.discord.token);
  await rest.put(Routes.applicationCommands(config.discord.clientId), {
    body: commands.map(c => c.data.toJSON()),
  });
  console.log('[Bot] Slash commands 已註冊');
}

async function main() {
  await bootstrapSheet();
  await registerCommands();

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  const commandMap = new Collection<string, typeof commands[0]>();
  for (const cmd of commands) {
    commandMap.set(cmd.data.name, cmd);
  }

  client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const cmd = commandMap.get(interaction.commandName);
    if (!cmd) return;
    try {
      await cmd.execute(interaction);
    } catch (err) {
      console.error(`[Bot] 指令錯誤 (${interaction.commandName}):`, err);
    }
  });

  client.once(Events.ClientReady, c => {
    console.log(`[Bot] 已登入為 ${c.user.tag}`);
    startScheduler(client);
  });

  await client.login(config.discord.token);
}

main().catch(err => {
  console.error('[Bot] 啟動失敗:', err);
  process.exit(1);
});
