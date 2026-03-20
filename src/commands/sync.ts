import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { triggerSync } from '../services/appsscript.js';

export const data = new SlashCommandBuilder()
  .setName('同步')
  .setDescription('手動將 Google Sheet 資料同步到 My Maps');

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const result = await triggerSync();

  if (result.error) {
    await interaction.editReply(`同步失敗：${result.error}`);
  } else {
    await interaction.editReply(`同步完成！新增 ${result.synced} 個地圖標記。`);
  }
}
