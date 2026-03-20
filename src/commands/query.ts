import {
  ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder,
} from 'discord.js';
import { getAllPlaces } from '../services/sheets.js';
import type { PlaceType } from '../types.js';

export const data = new SlashCommandBuilder()
  .setName('查詢')
  .setDescription('查看最近新增的地點')
  .addStringOption(o => o.setName('類型').setDescription('地點類型').setRequired(true)
    .addChoices(
      { name: '餐廳', value: '餐廳' },
      { name: '咖啡廳', value: '咖啡廳' },
      { name: '景點', value: '景點' },
      { name: '夜市', value: '夜市' },
    ))
  .addIntegerOption(o => o.setName('數量').setDescription('筆數（預設10，最多25）')
    .setMinValue(1).setMaxValue(25).setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const type = interaction.options.getString('類型', true) as PlaceType;
  const count = Math.min(interaction.options.getInteger('數量') ?? 10, 25);

  try {
    const all = await getAllPlaces();
    const filtered = all
      .filter(p => p.type === type)
      .sort((a, b) => new Date(b.added_at).getTime() - new Date(a.added_at).getTime())
      .slice(0, count);

    if (filtered.length === 0) {
      await interaction.editReply(`目前沒有${type}資料。`);
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`最近 ${filtered.length} 個${type}`)
      .setColor(0x57F287)
      .setDescription(
        filtered.map((p, i) =>
          `**${i + 1}. ${p.name}** ${p.cuisine ? `(${p.cuisine})` : ''}\n⭐ ${p.rating} · ${p.address}`
        ).join('\n\n')
      );

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    await interaction.editReply(`查詢失敗：${(err as Error).message}`);
  }
}
