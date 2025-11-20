require('dotenv').config();
const {
    Client,
    GatewayIntentBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    EmbedBuilder,
    PermissionsBitField,
    AttachmentBuilder,
    ChannelType,
    REST,
    Routes
} = require('discord.js');
const config = require('./config.json');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ]
});

const cooldowns = new Map();

client.once('ready', async () => {
    console.log(`✅ Бот запущен как ${client.user.tag}`);

    const commands = [
        {
            name: 'setup_recruitment',
            description: 'Установить кнопку подачи заявки',
        },
        {
            name: 'close_application',
            description: 'Закрывает и архивирует текущую ветку заявки (только для хайрангов).',
        },
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, config.guildId),
            { body: commands },
        );
        console.log('Slash-команды зарегистрированы.');
    } catch (error) {
        console.error(error);
    }
});

client.on('interactionCreate', async interaction => {

    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'setup_recruitment') {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({ content: 'Нет прав.', ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setTitle('🏛 Вступление в семью')
                .setDescription('Нажмите кнопку ниже, чтобы подать заявку.\nБот создаст для вас приватный чат.')
                .setColor(0x2B2D31)
                .setFooter({ text: 'dev by folny' })
                .setImage(config.bannerUrl);

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('btn_apply_start')
                        .setLabel('Подать заявку')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('📝')
                );

            await interaction.channel.send({
                embeds: [embed],
                components: [row],
            });
            return interaction.reply({ content: 'Готово!', ephemeral: true });
        }

        if (interaction.commandName === 'close_application') {
            const hasRole = interaction.member.roles.cache.some(role => config.rolesToPing.includes(role.id));
            const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);

            if (!hasRole && !isAdmin) {
                return interaction.reply({ content: '🚫 У вас нет прав для закрытия веток.', ephemeral: true });
            }

            if (!interaction.channel.isThread()) {
                return interaction.reply({ content: 'Эту команду можно использовать только внутри ветки заявки.', ephemeral: true });
            }

            try {
                await interaction.deferReply({ ephemeral: false });
                await interaction.channel.setLocked(true, `Ветка закрыта ${interaction.user.tag}`);
                await interaction.channel.setArchived(true, `Ветка закрыта ${interaction.user.tag}`);
                await interaction.editReply({
                    content: `✅ Ветка успешно **закрыта** и **архивирована** пользователем ${interaction.user.tag}.`
                });

            } catch (error) {
                console.error("Ошибка при закрытии ветки:", error);
                return interaction.editReply({
                    content: 'Произошла ошибка при попытке закрыть ветку. Проверьте права бота (Управление ветками).'
                });
            }
        }
    }


    if (interaction.isButton()) {
        if (interaction.customId === 'btn_apply_start') {
            if (cooldowns.has(interaction.user.id)) {
                const expTime = cooldowns.get(interaction.user.id) + (config.cooldownSeconds * 1000);
                if (Date.now() < expTime) {
                    return interaction.reply({ content: `⛔ Вы уже подавали заявку недавно.`, ephemeral: true });
                }
            }

            const modal = new ModalBuilder()
                .setCustomId('modal_application')
                .setTitle('Анкета в семью');

            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('field_name').setLabel("Имя персонажа").setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('field_age').setLabel("Возраст (ООС)").setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('field_static').setLabel("Статический ID").setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('field_goal').setLabel("Цель вступления").setStyle(TextInputStyle.Paragraph).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('field_source').setLabel("Откуда узнали?").setStyle(TextInputStyle.Short).setRequired(false))
            );

            await interaction.showModal(modal);
        }

        if (['btn_accept', 'btn_decline'].includes(interaction.customId)) {
            const hasRole = interaction.member.roles.cache.some(role => config.rolesToPing.includes(role.id));
            const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);

            if (!hasRole && !isAdmin) {
                return interaction.reply({ content: '🚫 Нет прав.', ephemeral: true });
            }

            const oldEmbed = interaction.message.embeds[0];
            const footerText = oldEmbed.footer?.text || '';

            let threadId = null;
            let userId = null;

            if (footerText.includes('ThreadID:')) {
                const parts = footerText.split(' | ');
                const tPart = parts.find(p => p.startsWith('ThreadID: '));
                const uPart = parts.find(p => p.startsWith('UserID: '));

                if (tPart) threadId = tPart.replace('ThreadID: ', '');
                if (uPart) userId = uPart.replace('UserID: ', '');
            }

            const isAccept = interaction.customId === 'btn_accept';

            if (threadId && userId) {
                try {
                    const threadChannel = await interaction.guild.channels.fetch(threadId);
                    if (threadChannel) {
                        if (isAccept) {
                            const voiceLink = `https://discord.com/channels/${interaction.guild.id}/${config.voiceChannelId}`;

                            await threadChannel.send({
                                content: `✅ <@${userId}>, **Ваша заявка ОДОБРЕНА!**\n\nМы ждем вас на обзвон в этом канале: ${voiceLink}\n\n(Нажмите на ссылку, чтобы подключиться)`
                            });
                        } else {
                            await threadChannel.send({
                                content: `❌ <@${userId}>, к сожалению, **ваша заявка отклонена**.\nВ данный момент мы не готовы принять вас в семью.`
                            });
                            await threadChannel.setLocked(true);
                            await threadChannel.setArchived(true);
                        }
                    }
                } catch (e) {
                    console.log('Ошибка доступа к ветке:', e);
                }
            } else {
                return interaction.reply({ content: 'Ошибка: Не удалось найти ID пользователя или ветки. Возможно, это старая заявка.', ephemeral: true });
            }

            const newEmbed = EmbedBuilder.from(oldEmbed);
            newEmbed.setColor(isAccept ? 0x57F287 : 0xED4245);
            newEmbed.setTitle(isAccept ? '✅ Заявка одобрена' : '❌ Заявка отклонена');
            newEmbed.setFields(oldEmbed.fields);
            newEmbed.setFooter({ text: `Обработал: ${interaction.user.tag}` });

            await interaction.message.edit({ embeds: [newEmbed], components: [] });
            return interaction.reply({ content: 'Решение отправлено пользователю!', ephemeral: true });
        }
    }
    
    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'modal_application') {
            await interaction.deferReply({ ephemeral: true });

            const name = interaction.fields.getTextInputValue('field_name');
            const age = interaction.fields.getTextInputValue('field_age');
            const staticId = interaction.fields.getTextInputValue('field_static');
            const goal = interaction.fields.getTextInputValue('field_goal');
            const source = interaction.fields.getTextInputValue('field_source') || '-';

            let thread;
            try {
                const appChannel = interaction.channel;
                thread = await appChannel.threads.create({
                    name: `заявка-${name}`,
                    autoArchiveDuration: 1440,
                    type: ChannelType.PrivateThread,
                    reason: 'Заявка в семью'
                });

                await thread.members.add(interaction.user.id);

                const pings = config.rolesToPing.map(id => `<@&${id}>`).join(' ');

                const userEmbed = new EmbedBuilder()
                    .setTitle('⏳ Заявка на рассмотрении')
                    .setDescription(`Здравствуйте, **${name}**!\nВаша заявка передана старшему составу.\n\nОжидайте ответа в этом чате.`)
                    .setColor(0xFEE75C);

                await thread.send({ content: `${interaction.user} ${pings}`, embeds: [userEmbed] });

            } catch (error) {
                console.error(error);
                return interaction.editReply({ content: 'Ошибка при создании ветки. Проверьте права бота.' });
            }

            const logChannel = client.channels.cache.get(config.logChannelId);
            if (logChannel) {
                const adminEmbed = new EmbedBuilder()
                    .setTitle('📄 Новая заявка')
                    .setColor(0xFEE75C)
                    .addFields(
                        { name: 'Имя', value: name, inline: true },
                        { name: 'Статик', value: staticId, inline: true },
                        { name: 'Возраст', value: age, inline: true },
                        { name: 'Цель', value: goal },
                        { name: 'Источник', value: source },
                        { name: 'Discord', value: `${interaction.user}` }
                    )
                    .setThumbnail(interaction.user.displayAvatarURL())
                    .setFooter({ text: `ThreadID: ${thread.id} | UserID: ${interaction.user.id}` });

                const adminRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder().setCustomId('btn_accept').setLabel('Принять').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId('btn_decline').setLabel('Отклонить').setStyle(ButtonStyle.Danger)
                    );

                await logChannel.send({ embeds: [adminEmbed], components: [adminRow] });
            }

            cooldowns.set(interaction.user.id, Date.now());
            await interaction.editReply({ content: `✅ Заявка отправлена! Перейдите в созданную ветку: <#${thread.id}>` });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);