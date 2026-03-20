import {
  ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder,
} from 'discord.js';
import { searchPlaces } from '../services/places.js';
import { getAllPlaces, appendPlaces } from '../services/sheets.js';
import { filterNewPlaces } from '../utils/dedup.js';
import type { PlaceType } from '../types.js';

export const data = new SlashCommandBuilder()
  .setName('搜尋')
  .setDescription('搜尋並新增地點到美食地圖')
  .addStringOption(o => o.setName('類型').setDescription('地點類型').setRequired(true)
    .addChoices(
      { name: '餐廳', value: '餐廳' },
      { name: '咖啡廳', value: '咖啡廳' },
      { name: '景點', value: '景點' },
      { name: '夜市', value: '夜市' },
    ))
  .addStringOption(o => o.setName('地點').setDescription('城市或地區，例如：台北、信義區').setRequired(true))
  .addStringOption(o => o.setName('料理類型').setDescription('例如：火鍋、漢堡（僅餐廳）').setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const type = interaction.options.getString('類型', true) as PlaceType;
  const location = interaction.options.getString('地點', true);
  const cuisine = interaction.options.getString('料理類型') ?? undefined;

  try {
    const [found, existing] = await Promise.all([
      searchPlaces({ type, location, cuisine }),
      getAllPlaces(),
    ]);
    const newPlaces = filterNewPlaces(found, existing);

    if (newPlaces.length === 0) {
      await interaction.editReply('沒有找到新地點（可能已在地圖中）。');
      return;
    }

    await appendPlaces(newPlaces);

    const embed = new EmbedBuilder()
      .setTitle(`新增 ${newPlaces.length} 個${type}`)
      .setColor(0x5865F2)
      .setDescription(
        newPlaces.slice(0, 10).map(p =>
          `**${p.name}** ${p.cuisine ? `(${p.cuisine})` : ''}\n⭐ ${p.rating} · ${p.address}`
        ).join('\n\n')
      )
      .setFooter({ text: '已加入 Google Sheet，輸入 /同步 更新地圖' });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    await interaction.editReply(`搜尋失敗：${(err as Error).message}`);
  }
}
