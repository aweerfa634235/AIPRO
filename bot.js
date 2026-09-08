require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const OWNER_ID      = '1309142783646498879';
const BOT_TOKEN     = process.env.DISCORD_BOT_TOKEN;
const API_URL       = process.env.API_URL || 'http://localhost:3000';
const BOT_API_SECRET = process.env.BOT_API_SECRET;

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// ── Register slash commands ────────────────────────
const commands = [
  new SlashCommandBuilder()
    .setName('addcredits')
    .setDescription('הוסף קרדיטים למשתמש (רק לבעל הבוט)')
    .addUserOption(opt =>
      opt.setName('user').setDescription('המשתמש לקבלת קרדיטים').setRequired(true))
    .addIntegerOption(opt =>
      opt.setName('amount').setDescription('כמות קרדיטים').setRequired(true).setMinValue(1)),

  new SlashCommandBuilder()
    .setName('credits')
    .setDescription('בדוק כמה קרדיטים יש לך'),
].map(c => c.toJSON());

client.once('ready', async () => {
  console.log(`Bot logged in as ${client.user.tag}`);

  const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('Slash commands registered.');
  } catch (err) {
    console.error('Failed to register commands:', err.message);
  }
});

// ── Handle interactions ────────────────────────────
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  // /addcredits
  if (interaction.commandName === 'addcredits') {
    // Only owner can use this
    if (interaction.user.id !== OWNER_ID) {
      return interaction.reply({
        content: '❌ אין לך הרשאה להשתמש בפקודה זו.',
        ephemeral: true,
      });
    }

    const target = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');

    await interaction.deferReply({ ephemeral: true });

    try {
      const res = await fetch(`${API_URL}/api/addcredits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret:     BOT_API_SECRET,
          discord_id: target.id,
          amount,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === 'user_not_found') {
          return interaction.editReply(`❌ המשתמש **${target.username}** לא נמצא במערכת AIPRO. הוא צריך להתחבר קודם לאתר.`);
        }
        return interaction.editReply(`❌ שגיאה: ${data.error}`);
      }

      const embed = new EmbedBuilder()
        .setColor(0x6d28d9)
        .setTitle('✅ קרדיטים נוספו בהצלחה')
        .addFields(
          { name: 'משתמש',        value: `<@${target.id}>`,       inline: true },
          { name: 'נוספו',         value: `+${amount} קרדיטים`,   inline: true },
          { name: 'סה"כ כרגע',    value: `${data.credits} קרדיטים`, inline: true },
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      // DM the user
      try {
        await target.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0x6d28d9)
              .setTitle('💎 קיבלת קרדיטים ב-AIPRO!')
              .setDescription(`נוספו לך **${amount} קרדיטים** על ידי הניהול.\nיש לך כעת **${data.credits} קרדיטים** באתר AIPRO.`)
              .setTimestamp()
          ]
        });
      } catch {
        // DM blocked — ignore
      }

    } catch (err) {
      console.error(err);
      await interaction.editReply('❌ שגיאת חיבור לשרת AIPRO. ודא שהשרת פועל.');
    }
  }

  // /credits
  if (interaction.commandName === 'credits') {
    await interaction.deferReply({ ephemeral: true });

    try {
      const res = await fetch(`${API_URL}/api/addcredits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret:     BOT_API_SECRET,
          discord_id: interaction.user.id,
          amount:     0,
        }),
      });

      // Use a dedicated check endpoint instead
      const checkRes = await fetch(`${API_URL}/api/credits-check?discord_id=${interaction.user.id}&secret=${BOT_API_SECRET}`);
      const data = await checkRes.json();

      if (!checkRes.ok || data.error === 'user_not_found') {
        return interaction.editReply('❌ לא נמצאת במערכת AIPRO. כנס לאתר והתחבר עם Discord תחילה.');
      }

      const embed = new EmbedBuilder()
        .setColor(0x6d28d9)
        .setTitle('💎 הקרדיטים שלך ב-AIPRO')
        .addFields(
          { name: 'משתמש',   value: interaction.user.username, inline: true },
          { name: 'קרדיטים', value: `${data.credits} 💎`,      inline: true },
        )
        .setFooter({ text: 'AIPRO · Mini=1 · Pro=3 · Ultra=10' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error(err);
      await interaction.editReply('❌ שגיאת חיבור לשרת AIPRO.');
    }
  }
});

client.login(BOT_TOKEN);
