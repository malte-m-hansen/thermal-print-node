const express = require('express');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const os = require('os');
const net = require('net');
const ipp = require('ipp');
const { Client, GatewayIntentBits } = require('discord.js');
const sharp = require('sharp');
const axios = require('axios');
const multer = require('multer');
require('dotenv').config();

const execAsync = promisify(exec);
const upload = multer({ dest: os.tmpdir() });

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Printer configuration - CUPS on Raspberry Pi
const PRINTER_NAME = 'BIXOLON_SRP-350plus';
const CUPS_SERVER = '192.168.1.168';
const CUPS_PORT = '631';
const RAW_PRINT_PORT = 9100; // Standard raw printing port
const USE_CUPS = true; // Set to false to use Windows printing

// ESC/POS commands for Bixolon printer
const ESC = '\x1B';
const GS = '\x1D';

const commands = {
  INIT: ESC + '@',
  ALIGN_CENTER: ESC + 'a' + '\x01',
  ALIGN_LEFT: ESC + 'a' + '\x00',
  ALIGN_RIGHT: ESC + 'a' + '\x02',
  BOLD_ON: ESC + 'E' + '\x01',
  BOLD_OFF: ESC + 'E' + '\x00',
  CUT: GS + 'V' + '\x00',
  NEWLINE: '\n',
};

// Convert emoji to text representation for thermal printer
function emojiToText(text) {
  // Common emoji mappings to ASCII/text
  // Format: [emoji, replacement, needsIndicator]
  const emojiMap = [
    // Face emojis - emoticon style (no indicator)
    ['😀', ':D', false], ['😃', ':D', false], ['😄', ':D', false], ['😁', ':D', false], ['😆', 'XD', false],
    ['😅', ':\')', false], ['😂', 'LOL', false], ['🤣', 'ROFL', false],
    ['😊', ':)', false], ['😇', 'O:)', false], ['🙂', ':)', false], ['🙃', '(:', false],
    ['😉', ';)', false], ['😌', ':)', false], ['😍', '<3', false], ['🥰', '<3', false], ['😘', ':*', false],
    ['😗', ':*', false], ['😙', ':*', false], ['😚', ':*', false],
    ['😋', ':P', false], ['😛', ':P', false], ['😜', ';P', false], ['🤪', ':P', false], ['😝', 'XP', false],
    ['🤑', '$_$', false], ['🤗', ':)', false], ['🤭', ':x', false], ['🤫', 'shh', false], ['🤔', 'hmm', false],
    ['🤐', ':x', false], ['🤨', ':|', false], ['😐', ':|', false], ['😑', '-_-', false], ['😶', ':|', false],
    ['😏', ':]', false], ['😒', ':/', false], ['😬', ':S', false], ['🙄', '-_-', false],
    ['😔', ':(', false], ['😕', ':(', false], ['🙁', ':(', false], ['☹️', ':(', false], ['😣', '>_<', false],
    ['😖', '>_<', false], ['😫', 'D:', false], ['😩', 'D:', false], ['🥺', ':(', false],
    ['😢', ':\'(', false], ['😭', 'T_T', false], ['😤', '>:(', false], ['😠', '>:(', false], ['😡', '>:(', false],
    ['🤬', '@#$%!', false], ['😱', 'O_O', false], ['😨', 'D:', false], ['😰', 'D:', false],
    ['😥', ':\'(', false], ['😓', ':/', false],
    ['😎', 'B)', false], ['🤓', '8)', false], ['🧐', 'monocle', true],
    ['😴', 'zzz', false], ['🤤', 'drool', true], ['😵', 'X_X', false],
    ['😷', 'sick', true], ['🤒', 'sick', true], ['🤕', 'hurt', true], ['🤢', 'sick', true], ['🤮', 'sick', true],
    ['🥴', 'dizzy', true], ['🤧', 'achoo', true], ['🤯', 'mind-blown', true],
    
    // Hand gestures
    ['👍', '+1', false], ['👎', '-1', false], ['👌', 'OK', false], ['✌️', 'peace', true], ['🤞', 'fingers-crossed', true],
    ['🤟', 'love', true], ['🤘', 'rock', true], ['👏', 'clap', true], ['🙌', 'praise', true],
    ['👋', 'wave', true], ['🤚', 'hand', true], ['✋', 'hand', true], ['🖐️', 'hand', true], ['👊', 'fist', true],
    ['✊', 'fist', true], ['🤛', 'fist', true], ['🤜', 'fist', true], ['🤝', 'handshake', true],
    ['🙏', 'pray', true], ['✍️', 'writing', true], ['💪', 'strong', true],
    
    // Hearts (special characters, no indicator)
    ['❤️', '<3', false], ['🧡', '<3', false], ['💛', '<3', false], ['💚', '<3', false], ['💙', '<3', false], ['💜', '<3', false],
    ['🖤', '</3', false], ['🤍', '<3', false], ['🤎', '<3', false], ['💔', '</3', false], ['❣️', '<3', false], ['💕', '<3', false],
    ['💞', '<3', false], ['💓', '<3', false], ['💗', '<3', false], ['💖', '<3', false], ['💘', '<3', false], ['💝', '<3', false],
    ['💟', '<3', false],
    
    // Symbols
    ['🔥', 'fire', true], ['⭐', '*', false], ['✨', 'sparkle', true], ['💫', '*', false], ['⚡', '!', false],
    ['💥', 'BOOM', false], ['💯', '100', false], ['✅', '[OK]', false], ['❌', '[X]', false],
    ['⚠️', '!WARNING!', false], ['🚫', '[NO]', false], ['🔞', '18+', false],
    ['💬', 'chat', true], ['💭', '...', false], ['🗨️', 'chat', true], ['🗯️', '!!!', false],
    ['💤', 'zzz', false], ['💨', 'dash', true],
    
    // Celebrations
    ['🎉', 'party', true], ['🎊', 'celebrate', true], ['🎈', 'balloon', true], ['🎁', 'gift', true],
    ['🎂', 'cake', true], ['🎄', 'tree', true], ['🎃', 'pumpkin', true],
    
    // Trophies
    ['🏆', 'TROPHY', true], ['🥇', '1st', false], ['🥈', '2nd', false], ['🥉', '3rd', false], ['🏅', 'medal', true],
    
    // Sports
    ['⚽', 'soccer', true], ['🏀', 'basketball', true], ['🏈', 'football', true], ['⚾', 'baseball', true],
    ['🎮', 'game', true], ['🎯', 'target', true], ['🎲', 'dice', true], ['🎰', 'slots', true],
    
    // Food
    ['🍕', 'pizza', true], ['🍔', 'burger', true], ['🍟', 'fries', true], ['🌭', 'hotdog', true],
    ['🍿', 'popcorn', true], ['🧈', 'butter', true], ['🍞', 'bread', true], ['🥐', 'croissant', true],
    ['🥖', 'baguette', true], ['🥨', 'pretzel', true], ['🥯', 'bagel', true], ['🍩', 'donut', true],
    ['🍪', 'cookie', true], ['🍰', 'cake', true], ['🧁', 'cupcake', true],
    ['🍫', 'chocolate', true], ['🍬', 'candy', true], ['🍭', 'lollipop', true],
    
    // Drinks
    ['☕', 'coffee', true], ['🍵', 'tea', true], ['🥤', 'drink', true], ['🍺', 'beer', true],
    ['🍻', 'cheers', true], ['🍷', 'wine', true], ['🥂', 'champagne', true], ['🍾', 'champagne', true],
    
    // Places
    ['🌍', 'Earth', true], ['🌎', 'Earth', true], ['🌏', 'Earth', true], ['🌐', 'globe', true],
    ['🗺️', 'map', true], ['🧭', 'compass', true], ['⛰️', 'mountain', true], ['🏔️', 'mountain', true],
    ['🌋', 'volcano', true], ['🏕️', 'camping', true], ['🏖️', 'beach', true], ['🏝️', 'island', true],
    ['🌅', 'sunrise', true], ['🌄', 'sunrise', true], ['🌠', 'shooting-star', true], ['🌌', 'galaxy', true],
    ['🌃', 'night', true], ['🌆', 'city', true], ['🌇', 'sunset', true],
    
    // Weather
    ['☀️', 'sun', true], ['🌤️', 'sunny', true], ['⛅', 'cloudy', true], ['☁️', 'cloud', true],
    ['🌥️', 'cloudy', true], ['⛈️', 'storm', true], ['🌦️', 'rain', true], ['🌧️', 'rain', true],
    ['💧', 'drop', true], ['💦', 'water', true], ['☔', 'umbrella', true], ['⛱️', 'umbrella', true],
    ['❄️', 'snow', true], ['☃️', 'snowman', true], ['⛄', 'snowman', true], ['🌨️', 'snow', true],
    ['💨', 'wind', true], ['🌪️', 'tornado', true], ['🌫️', 'fog', true],
    ['🌈', 'rainbow', true],
    
    // Vehicles
    ['🚗', 'car', true], ['🚕', 'taxi', true], ['🚙', 'car', true], ['🚌', 'bus', true], ['🚎', 'bus', true],
    ['🏎️', 'race-car', true], ['🚓', 'police', true], ['🚑', 'ambulance', true], ['🚒', 'fire-truck', true],
    ['🚐', 'van', true], ['🚚', 'truck', true], ['🚛', 'truck', true], ['🚜', 'tractor', true],
    ['🛴', 'scooter', true], ['🚲', 'bike', true], ['🛵', 'scooter', true], ['🏍️', 'motorcycle', true],
    ['✈️', 'plane', true], ['🛫', 'plane', true], ['🛬', 'plane', true], ['🚁', 'helicopter', true],
    ['🚂', 'train', true], ['🚆', 'train', true], ['🚇', 'metro', true], ['🚊', 'tram', true],
    ['🚀', 'rocket', true], ['🛸', 'UFO', true], ['🚢', 'ship', true], ['⛵', 'sailboat', true],
    
    // Electronics
    ['⏰', 'alarm', true], ['⏱️', 'timer', true], ['⏲️', 'timer', true], ['⌚', 'watch', true],
    ['📱', 'phone', true], ['📞', 'phone', true], ['☎️', 'phone', true], ['📟', 'pager', true],
    ['📠', 'fax', true], ['📺', 'TV', true], ['📻', 'radio', true], ['🎙️', 'mic', true],
    ['🎚️', 'slider', true], ['🎛️', 'knobs', true],
    ['💻', 'laptop', true], ['🖥️', 'computer', true], ['⌨️', 'keyboard', true], ['🖱️', 'mouse', true],
    ['🖨️', 'printer', true], ['💾', 'floppy', true], ['💿', 'CD', false], ['📀', 'DVD', false],
    ['🎥', 'camera', true], ['📷', 'camera', true], ['📸', 'camera', true], ['📹', 'video', true],
    ['📼', 'VHS', false], ['🔍', 'search', true], ['🔎', 'search', true], ['🔬', 'microscope', true],
    ['🔭', 'telescope', true], ['📡', 'satellite', true], ['🕯️', 'candle', true],
    ['💡', 'bulb', true], ['🔦', 'flashlight', true], ['🏮', 'lantern', true],
    
    // Office
    ['📕', 'book', true], ['📗', 'book', true], ['📘', 'book', true], ['📙', 'book', true], ['📔', 'notebook', true],
    ['📓', 'notebook', true], ['📒', 'ledger', true], ['📃', 'page', true], ['📜', 'scroll', true],
    ['📄', 'document', true], ['📰', 'newspaper', true], ['📑', 'bookmark', true],
    ['✉️', 'mail', true], ['📧', 'email', true], ['📨', 'mail', true], ['📩', 'mail', true],
    ['📦', 'package', true], ['📫', 'mailbox', true], ['📪', 'mailbox', true], ['📬', 'mailbox', true],
    ['✏️', 'pencil', true], ['✒️', 'pen', true], ['🖊️', 'pen', true], ['🖋️', 'pen', true],
    ['🖍️', 'crayon', true], ['📝', 'memo', true], ['💼', 'briefcase', true], ['📁', 'folder', true],
    ['📂', 'folder', true], ['🗂️', 'dividers', true], ['📅', 'calendar', true], ['📆', 'calendar', true],
    ['🗓️', 'calendar', true], ['📇', 'card', true], ['📈', 'chart-up', true], ['📉', 'chart-down', true],
    ['📊', 'chart', true], ['📋', 'clipboard', true], ['📌', 'pin', true], ['📍', 'pin', true],
    
    // Tools
    ['✂️', 'scissors', true], ['🔒', 'lock', true], ['🔓', 'unlock', true], ['🔐', 'locked', true],
    ['🔑', 'key', true], ['🗝️', 'key', true], ['🔨', 'hammer', true], ['⛏️', 'pickaxe', true],
    ['⚒️', 'hammer', true], ['🛠️', 'tools', true], ['🗡️', 'sword', true], ['⚔️', 'swords', true],
    ['🔫', 'gun', true], ['🏹', 'bow', true], ['🛡️', 'shield', true], ['🔧', 'wrench', true],
    ['🔩', 'bolt', true], ['⚙️', 'gear', true], ['🗜️', 'clamp', true], ['⚖️', 'scale', true],
    ['🔗', 'link', true], ['⛓️', 'chain', true], ['💉', 'syringe', true], ['💊', 'pill', true],
    ['🩹', 'bandaid', true], ['🩺', 'stethoscope', true], ['🌡️', 'thermometer', true],
    
    // Home
    ['🚪', 'door', true], ['🛏️', 'bed', true], ['🛋️', 'couch', true], ['🚽', 'toilet', true],
    ['🚿', 'shower', true], ['🛁', 'bath', true], ['🧴', 'lotion', true], ['🧷', 'pin', true],
    ['🧹', 'broom', true], ['🧺', 'basket', true], ['🧻', 'toilet-paper', true], ['🧼', 'soap', true],
    ['🧽', 'sponge', true], ['🧯', 'fire-extinguisher', true],
    
    // Animals
    ['🐶', 'dog', true], ['🐱', 'cat', true], ['🐭', 'mouse', true], ['🐹', 'hamster', true],
    ['🐰', 'rabbit', true], ['🦊', 'fox', true], ['🐻', 'bear', true], ['🐼', 'panda', true],
    ['🐨', 'koala', true], ['🐯', 'tiger', true], ['🦁', 'lion', true], ['🐮', 'cow', true],
    ['🐷', 'pig', true], ['🐸', 'frog', true], ['🐵', 'monkey', true], ['🙈', 'see-no-evil', true],
    ['🙉', 'hear-no-evil', true], ['🙊', 'speak-no-evil', true], ['🐔', 'chicken', true],
    ['🐧', 'penguin', true], ['🐦', 'bird', true], ['🐤', 'chick', true], ['🦆', 'duck', true],
    ['🦅', 'eagle', true], ['🦉', 'owl', true], ['🦇', 'bat', true], ['🐺', 'wolf', true],
    ['🐗', 'boar', true], ['🐴', 'horse', true], ['🦄', 'unicorn', true], ['🐝', 'bee', true],
    ['🐛', 'bug', true], ['🦋', 'butterfly', true], ['🐌', 'snail', true], ['🐞', 'ladybug', true],
    ['🐜', 'ant', true], ['🦗', 'cricket', true], ['🕷️', 'spider', true], ['🕸️', 'web', true],
    ['🦂', 'scorpion', true], ['🐢', 'turtle', true], ['🐍', 'snake', true], ['🦎', 'lizard', true],
    ['🦖', 'T-rex', true], ['🦕', 'dinosaur', true], ['🐙', 'octopus', true], ['🦑', 'squid', true],
    ['🦐', 'shrimp', true], ['🦞', 'lobster', true], ['🦀', 'crab', true], ['🐡', 'fish', true],
    ['🐠', 'fish', true], ['🐟', 'fish', true], ['🐬', 'dolphin', true], ['🐳', 'whale', true],
    ['🐋', 'whale', true], ['🦈', 'shark', true],
    
    // Plants
    ['🌲', 'tree', true], ['🌳', 'tree', true], ['🌴', 'palm', true], ['🌱', 'seedling', true],
    ['🌿', 'herb', true], ['☘️', 'clover', true], ['🍀', '4-leaf-clover', true], ['🎋', 'bamboo', true],
    ['🎍', 'pine', true], ['🌾', 'grain', true], ['🌺', 'flower', true], ['🌻', 'sunflower', true],
    ['🌹', 'rose', true], ['🥀', 'wilted', true], ['🌷', 'tulip', true], ['🌼', 'blossom', true],
    ['🌸', 'cherry-blossom', true], ['💐', 'bouquet', true], ['🍄', 'mushroom', true],
    ['🌰', 'chestnut', true], ['🐚', 'shell', true],
    
    // Fantasy
    ['👻', 'ghost', true], ['👽', 'alien', true], ['👾', 'invader', true], ['🤖', 'robot', true],
    ['💀', 'skull', true], ['☠️', 'skull', true], ['👹', 'ogre', true], ['👺', 'goblin', true],
    ['🤡', 'clown', true], ['👿', 'devil', true], ['😈', '>:)', false], ['🎅', 'santa', true],
    ['🤶', 'mrs-claus', true], ['🧙', 'wizard', true], ['🧚', 'fairy', true], ['🧛', 'vampire', true],
    ['🧜', 'merperson', true], ['🧝', 'elf', true], ['🧞', 'genie', true], ['🧟', 'zombie', true],
    ['💩', 'poop', true],
    
    // Cat faces (emoticon style)
    ['😺', ':3', false], ['😸', ':D', false], ['😹', 'LOL', false],
    ['😻', '<3', false], ['😼', ':3', false], ['😽', ':*', false], ['🙀', 'O_O', false], ['😿', ':\'(', false],
    ['😾', '>:(', false],
    
    // Text
    ['🆗', 'OK', false], ['🆕', 'NEW', false], ['🆒', 'COOL', false], ['🆓', 'FREE', false],
    ['🆙', 'UP', false], ['🆚', 'VS', false], ['🈁', 'here', true],
    
    // Music
    ['🎵', 'note', true], ['🎶', 'notes', true], ['🔔', 'bell', true], ['🔕', 'no-bell', true],
    ['📣', 'megaphone', true], ['📢', 'loudspeaker', true],
    
    // Cards
    ['♠️', 'spade', true], ['♥️', 'heart', true], ['♦️', 'diamond', true], ['♣️', 'club', true],
    ['🃏', 'joker', true], ['🀄', 'mahjong', true], ['🎴', 'cards', true],
  ];
  
  // Replace emojis with text equivalents
  let result = text;
  for (const [emoji, textRep, needsIndicator] of emojiMap) {
    if (needsIndicator) {
      result = result.split(emoji).join(`:${textRep}:`);
    } else {
      result = result.split(emoji).join(textRep);
    }
  }
  
  // Remove any remaining emojis that we don't have mappings for
  // This regex matches most emoji characters
  result = result.replace(/[\u{1F600}-\u{1F64F}]/gu, ':)'); // Emoticons
  result = result.replace(/[\u{1F300}-\u{1F5FF}]/gu, '[emoji]'); // Misc Symbols and Pictographs
  result = result.replace(/[\u{1F680}-\u{1F6FF}]/gu, '[emoji]'); // Transport and Map
  result = result.replace(/[\u{1F1E0}-\u{1F1FF}]/gu, ''); // Flags (iOS)
  result = result.replace(/[\u{2600}-\u{26FF}]/gu, '[symbol]'); // Misc symbols
  result = result.replace(/[\u{2700}-\u{27BF}]/gu, '[symbol]'); // Dingbats
  result = result.replace(/[\u{1F900}-\u{1F9FF}]/gu, '[emoji]'); // Supplemental Symbols and Pictographs
  result = result.replace(/[\u{1FA00}-\u{1FA6F}]/gu, '[emoji]'); // Chess Symbols
  result = result.replace(/[\u{1FA70}-\u{1FAFF}]/gu, '[emoji]'); // Symbols and Pictographs Extended-A
  result = result.replace(/[\u{FE00}-\u{FE0F}]/gu, ''); // Variation selectors
  result = result.replace(/[\u{200D}]/gu, ''); // Zero width joiner
  
  return result;
}

function formatReceipt(reminder) {
  // Convert emojis before formatting
  reminder = emojiToText(reminder);
  let receipt = commands.INIT;
  
  // Epic Header
  receipt += commands.ALIGN_CENTER;
  receipt += commands.BOLD_ON;
  receipt += '\n';
  receipt += '================================\n';
  receipt += '  ____  _____ __  __ ___ _  _ \n';
  receipt += ' |  _ \\| ____|  \\/  |_ _| \\| |\n';
  receipt += ' | |_) |  _| | |\\/| || ||  \\ |\n';
  receipt += ' |  _ <| |___| |  | || || |\\  |\n';
  receipt += ' |_| \\_\\_____|_|  |_|___|_| \\_|\n';
  receipt += '        ___  ____ ____  \n';
  receipt += '       |   \\| ___| _ \\ \n';
  receipt += '       | |\\ | _| |   / \n';
  receipt += '       |_| \\_\\___|_|\\_\\\n';
  receipt += '\n';
  receipt += '      ** YOUR REMINDER **\n';
  receipt += '================================\n';
  receipt += commands.BOLD_OFF;
  receipt += '\n';
  
  // Content with simple borders
  receipt += commands.ALIGN_LEFT;
  receipt += '+------------------------------+\n';
  receipt += '|                              |\n';
  
  // Split reminder into lines
  const lines = reminder.match(/.{1,28}/g) || [reminder];
  lines.forEach(line => {
    receipt += '| ' + line.padEnd(28) + ' |\n';
  });
  
  receipt += '|                              |\n';
  receipt += '+------------------------------+\n';
  receipt += '\n';
  
  // Footer
  receipt += commands.ALIGN_CENTER;
  receipt += '--------------------------------\n';
  receipt += commands.BOLD_ON;
  receipt += '    >> DON\'T FORGET IT! <<\n';
  receipt += commands.BOLD_OFF;
  receipt += '--------------------------------\n';
  const timestamp = new Date().toLocaleString();
  receipt += `   ${timestamp}\n`;
  receipt += '\n';
  receipt += commands.BOLD_OFF;
  receipt += '================================\n';
  receipt += '\n\n\n\n\n';
  
  // Cut paper
  receipt += commands.CUT;
  
  return receipt;
}

function formatDiscordMessage(username, message) {
  // Convert emojis to text before formatting
  message = emojiToText(message);
  username = emojiToText(username);
  
  let receipt = commands.INIT;
  
  receipt += commands.ALIGN_CENTER;
  receipt += commands.BOLD_ON;
  receipt += '\n';
  receipt += '================================\n';
  receipt += '       DISCORD MESSAGE\n';
  receipt += '================================\n';
  receipt += commands.BOLD_OFF;
  receipt += '\n';
  
  receipt += commands.ALIGN_LEFT;
  receipt += commands.BOLD_ON;
  receipt += `From: ${username}\n`;
  receipt += commands.BOLD_OFF;
  receipt += '--------------------------------\n';
  receipt += '\n';
  
  // Split message into lines
  const lines = message.match(/.{1,32}/g) || [message];
  lines.forEach(line => {
    receipt += line + '\n';
  });
  
  receipt += '\n';
  receipt += '--------------------------------\n';
  const timestamp = new Date().toLocaleString();
  receipt += commands.ALIGN_CENTER;
  receipt += `${timestamp}\n`;
  receipt += '================================\n';
  receipt += '\n\n\n\n\n';
  receipt += commands.CUT;
  
  return receipt;
}

function formatHomeAssistant(title, message, icon = '') {
  // Convert emojis to text
  title = emojiToText(title);
  message = emojiToText(message);
  icon = emojiToText(icon);
  
  let receipt = commands.INIT;
  
  receipt += commands.ALIGN_CENTER;
  receipt += commands.BOLD_ON;
  receipt += '\n';
  receipt += '================================\n';
  receipt += '       HOME ASSISTANT\n';
  receipt += '================================\n';
  receipt += commands.BOLD_OFF;
  receipt += '\n';
  
  if (icon) {
    receipt += `${icon}\n\n`;
  }
  
  receipt += commands.BOLD_ON;
  receipt += `${title}\n`;
  receipt += commands.BOLD_OFF;
  receipt += '--------------------------------\n';
  receipt += '\n';
  
  receipt += commands.ALIGN_LEFT;
  const lines = message.match(/.{1,32}/g) || [message];
  lines.forEach(line => {
    receipt += line + '\n';
  });
  
  receipt += '\n';
  receipt += '--------------------------------\n';
  const timestamp = new Date().toLocaleString();
  receipt += commands.ALIGN_CENTER;
  receipt += `${timestamp}\n`;
  receipt += '================================\n';
  receipt += '\n\n\n\n\n';
  receipt += commands.CUT;
  
  return receipt;
}

// Atkinson dithering for better quality on thermal printers
function ditherImage(imageData, width, height) {
  const pixels = new Uint8ClampedArray(imageData);
  
  // Apply gamma correction for better tonal balance
  // Gamma < 1 brightens shadows without blowing out highlights
  const gamma = 0.7;
  for (let i = 0; i < pixels.length; i++) {
    let pixel = pixels[i] / 255;
    pixel = Math.pow(pixel, gamma);
    pixels[i] = Math.round(pixel * 255);
  }
  
  // Atkinson dithering (better for thermal printers than Floyd-Steinberg)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const oldPixel = pixels[idx];
      const newPixel = oldPixel < 128 ? 0 : 255;
      pixels[idx] = newPixel;
      
      const error = (oldPixel - newPixel) / 8; // Divide by 8 for Atkinson
      
      // Distribute error to neighboring pixels (Atkinson pattern)
      if (x + 1 < width) pixels[idx + 1] += error;
      if (x + 2 < width) pixels[idx + 2] += error;
      
      if (y + 1 < height) {
        if (x - 1 >= 0) pixels[idx + width - 1] += error;
        pixels[idx + width] += error;
        if (x + 1 < width) pixels[idx + width + 1] += error;
      }
      
      if (y + 2 < height) {
        pixels[idx + width * 2] += error;
      }
    }
  }
  
  return pixels;
}

// Convert image to ESC/POS bitmap format (GS v 0)
async function processImageForPrinter(imagePath, maxWidth = 384) {
  try {
    console.log('Processing image:', imagePath);
    
    // Load and process image
    const image = sharp(imagePath);
    const metadata = await image.metadata();
    
    console.log(`Original size: ${metadata.width}x${metadata.height}`);
    
    // Very conservative limits for Bixolon SRP-350plus
    let width = metadata.width;
    let height = metadata.height;
    
    // Strict height limit first - 150 is very safe
    const maxHeight = 150;
    if (height > maxHeight) {
      width = Math.round((width * maxHeight) / height);
      height = maxHeight;
    }
    
    // Then check width
    if (width > maxWidth) {
      height = Math.round((height * maxWidth) / width);
      width = maxWidth;
    }
    
    // Double-check height again after width adjustment
    if (height > maxHeight) {
      width = Math.round((width * maxHeight) / height);
      height = maxHeight;
    }
    
    // If image is small, scale it up to use more of the paper
    const minWidth = 256;
    if (width < minWidth && height < maxHeight) {
      const scale = minWidth / width;
      width = minWidth;
      height = Math.round(height * scale);
      
      // Make sure we don't exceed max height when scaling up
      if (height > maxHeight) {
        width = Math.round((width * maxHeight) / height);
        height = maxHeight;
      }
    }
    
    console.log(`Resized to: ${width}x${height}`);
    
    // Convert to grayscale and resize
    const { data, info } = await image
      .resize(width, height, { fit: 'inside' })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    
    console.log('Applying dithering...');
    
    // Apply dithering
    const dithered = ditherImage(data, info.width, info.height);
    
    console.log('Building print data...');
    
    // Build receipt with header
    let receipt = commands.INIT;
    receipt += commands.ALIGN_CENTER;
    receipt += commands.BOLD_ON;
    receipt += '\n';
    receipt += '================================\n';
    receipt += '          IMAGE PRINT\n';
    receipt += '================================\n';
    receipt += commands.BOLD_OFF;
    receipt += `${info.width} x ${info.height} pixels\n`;
    receipt += '\n';
    
    // Use GS v 0 command (raster bitmap) - single block
    const widthBytes = Math.ceil(info.width / 8);
    const xL = widthBytes & 0xFF;
    const xH = (widthBytes >> 8) & 0xFF;
    const yL = info.height & 0xFF;
    const yH = (info.height >> 8) & 0xFF;
    
    receipt += GS + 'v' + String.fromCharCode(48); // GS v 0
    receipt += String.fromCharCode(0); // m = 0 (normal mode)
    receipt += String.fromCharCode(xL);
    receipt += String.fromCharCode(xH);
    receipt += String.fromCharCode(yL);
    receipt += String.fromCharCode(yH);
    
    // Convert pixels to bytes
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x += 8) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const px = x + bit;
          if (px < info.width) {
            const pixel = dithered[y * info.width + px];
            if (pixel === 0) { // Black pixel
              byte |= (1 << (7 - bit));
            }
          }
        }
        receipt += String.fromCharCode(byte);
      }
    }
    
    console.log('Image processing complete!');
    
    receipt += '\n\n\n\n\n';
    receipt += commands.CUT;
    
    return receipt;
  } catch (error) {
    console.error('Error processing image:', error);
    throw error;
  }
}

async function printToDevice(data) {
  if (USE_CUPS) {
    // Print to CUPS printer using IPP protocol
    return new Promise((resolve, reject) => {
      const printerUri = `ipp://${CUPS_SERVER}:${CUPS_PORT}/printers/${PRINTER_NAME}`;
      
      const printer = ipp.Printer(printerUri);
      
      const msg = {
        "operation-attributes-tag": {
          "requesting-user-name": "CoolPrinter",
          "job-name": `Print_${Date.now()}`,
          "document-format": "application/octet-stream"
        },
        data: Buffer.from(data, 'binary')
      };
      
      printer.execute("Print-Job", msg, (err, res) => {
        if (err) {
          console.error('IPP printing error:', err);
          reject(err);
        } else {
          console.log('Print job sent successfully via IPP');
          if (res && res['job-attributes-tag']) {
            console.log('Job ID:', res['job-attributes-tag']['job-id']);
          }
          resolve();
        }
      });
    });
  } else {
    // Windows printing
    const tempFile = path.join(os.tmpdir(), `receipt_${Date.now()}.prn`);
    await fs.writeFile(tempFile, data, 'binary');
    const printCommand = `copy /b "${tempFile}" "\\\\localhost\\${PRINTER_NAME}"`;
    await execAsync(printCommand, { shell: 'cmd.exe' });
    await fs.unlink(tempFile).catch(() => {});
  }
}

// Health check endpoint
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// List all available endpoints
app.get('/endpoints', (req, res) => {
  // Dynamically extract all routes from Express
  const routes = [];
  
  app._router.stack.forEach((middleware) => {
    if (middleware.route) {
      // Routes registered directly on the app
      const methods = Object.keys(middleware.route.methods).map(m => m.toUpperCase());
      routes.push({
        method: methods[0],
        path: middleware.route.path
      });
    }
  });

  // Optional descriptions for known endpoints
  const descriptions = {
    '/': 'Web interface for printing reminders and images',
    '/endpoints': 'List all available API endpoints (this page)',
    '/print': 'Print a custom reminder/note',
    '/print-image': 'Upload and print an image (dithered for thermal printer)',
    '/homeassistant': 'Home Assistant webhook for notifications',
    '/printers': 'List available printers (troubleshooting)',
    '/print-quote': 'Print a random motivational quote',
    '/print-fortune': 'Print a random fortune cookie message',
    '/print-time': 'Print the current date and time',
    '/print-joke': 'Print a random joke',
    '/print-shopping': 'Print a shopping list',
    '/print-grocy': 'Print shopping list from Grocy (requires GROCY_API_KEY)',
    '/print-stock': 'Print current stock inventory from Grocy (requires GROCY_API_KEY)',
    '/print-nvidia-stock': 'Print NVIDIA stock chart with 10-day price history',
    '/print-weather': 'Print weather forecast for Engesvang, Denmark (7442)',
    '/print-fact': 'Print a random interesting fact from the internet',
    '/print-apod': 'Print NASA Astronomy Picture of the Day info',
    '/print-dice': 'Roll dice - use ?dice=2d6 for 2 six-sided dice',
    '/print-8ball': 'Ask the magic 8-ball a question - use ?q=your question',
    '/print-coinflip': 'Flip a coin (heads or tails)',
    '/print-trivia': 'Print a random trivia question with multiple choice answers',
    '/print-affirmation': 'Print a positive daily affirmation',
    '/print-crypto': 'Print cryptocurrency prices - use ?coins=bitcoin,ethereum',
    '/print-moon': 'Print current moon phase and illumination',
    '/print-iss': 'Print International Space Station current location',
    '/print-compliment': 'Print a random compliment',
    '/print-word': 'Print word of the day with definition',
    '/print-qr': 'Generate and print QR code - use ?text=your text or ?url=link'
  };

  const endpoints = routes.map(route => ({
    method: route.method,
    path: route.path,
    description: descriptions[route.path] || 'No description available'
  }));

  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>CoolPrinter API Endpoints</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      max-width: 1000px;
      margin: 50px auto;
      padding: 20px;
      background: #f5f5f5;
    }
    h1 {
      color: #333;
      text-align: center;
    }
    .endpoint {
      background: white;
      border-radius: 8px;
      padding: 15px;
      margin: 10px 0;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .method {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 4px;
      font-weight: bold;
      font-size: 12px;
      margin-right: 10px;
    }
    .get { background: #61affe; color: white; }
    .post { background: #49cc90; color: white; }
    .path {
      font-family: monospace;
      font-size: 16px;
      font-weight: bold;
      color: #333;
    }
    .description {
      margin-top: 8px;
      color: #666;
    }
    .discord-info {
      background: #5865f2;
      color: white;
      padding: 15px;
      border-radius: 8px;
      margin: 20px 0;
    }
  </style>
</head>
<body>
  <h1>🖨️ CoolPrinter API Endpoints</h1>
  
  ${process.env.DISCORD_TOKEN ? `
  <div class="discord-info">
    <strong>💬 Discord Integration Active</strong><br>
    Monitoring channel: ${process.env.DISCORD_CHANNEL_ID}<br>
    Commands: <code>!print &lt;text&gt;</code>, <code>!printhelp</code><br>
    All messages and images in the monitored channel auto-print!
  </div>
  ` : ''}
  
  ${endpoints.map(ep => `
    <div class="endpoint">
      <div>
        <span class="method ${ep.method.toLowerCase()}">${ep.method}</span>
        <span class="path">${ep.path}</span>
      </div>
      <div class="description">${ep.description}</div>
      ${ep.body ? `<div class="body">Body: ${JSON.stringify(ep.body)}</div>` : ''}
    </div>
  `).join('')}
  
  <div style="text-align: center; margin-top: 30px; color: #999;">
    Server running on port ${PORT}
  </div>
</body>
</html>
  `;

  res.send(html);
});

// Print reminder endpoint
app.post('/print', async (req, res) => {
  try {
    const { reminder } = req.body;

    if (!reminder || reminder.trim() === '') {
      return res.status(400).json({ error: 'Reminder text is required' });
    }

    const receiptData = formatReceipt(reminder);
    await printToDevice(receiptData);
    
    console.log(`Printed reminder: ${reminder.substring(0, 50)}...`);
    res.json({ success: true, message: 'Reminder printed successfully!' });

  } catch (error) {
    console.error('Print error:', error);
    res.status(500).json({ 
      error: 'Failed to print', 
      details: error.message,
      help: 'Make sure the printer is connected and turned on.'
    });
  }
});

// Random motivational quote printer
app.get('/print-quote', async (req, res) => {
  try {
    console.log('Fetching random quote...');
    
    // Using ZenQuotes API (free, no key required)
    const response = await axios.get('https://zenquotes.io/api/random');
    const quoteData = response.data[0];
    const quote = quoteData.q;
    const author = quoteData.a;
    
    let receipt = commands.INIT;
    receipt += commands.ALIGN_CENTER;
    receipt += commands.BOLD_ON;
    receipt += '\n';
    receipt += '================================\n';
    receipt += '    MOTIVATIONAL QUOTE\n';
    receipt += '================================\n';
    receipt += commands.BOLD_OFF;
    receipt += '\n';
    receipt += commands.ALIGN_LEFT;
    
    // Wrap quote text
    const words = quote.split(' ');
    let line = '';
    words.forEach(word => {
      if ((line + word).length > 32) {
        receipt += line.trim() + '\n';
        line = word + ' ';
      } else {
        line += word + ' ';
      }
    });
    if (line.trim()) receipt += line.trim() + '\n';
    
    receipt += '\n';
    receipt += commands.ALIGN_RIGHT;
    receipt += `- ${author}\n`;
    receipt += '\n';
    receipt += commands.ALIGN_CENTER;
    const timestamp = new Date().toLocaleString();
    receipt += `${timestamp}\n`;
    receipt += '================================\n';
    receipt += '\n\n\n\n\n';
    receipt += commands.CUT;
    
    await printToDevice(receipt);
    
    res.json({ success: true, message: 'Motivational quote printed!', quote: `${quote} - ${author}` });
  } catch (error) {
    console.error('Quote error:', error.message);
    res.status(500).json({ error: 'Failed to print quote', details: error.message });
  }
});

// Fortune cookie printer
app.get('/print-fortune', async (req, res) => {
  try {
    console.log('Fetching fortune cookie...');
    
    // Using helloacm.com fortune API (free, no key required)
    const response = await axios.get('https://helloacm.com/api/fortune/', {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });
    const fortune = response.data;
    
    let receipt = commands.INIT;
    receipt += commands.ALIGN_CENTER;
    receipt += commands.BOLD_ON;
    receipt += '\n';
    receipt += '================================\n';
    receipt += '      FORTUNE COOKIE\n';
    receipt += '================================\n';
    receipt += commands.BOLD_OFF;
    receipt += '\n';
    receipt += commands.ALIGN_LEFT;
    
    // Wrap text to fit printer width
    const words = fortune.split(' ');
    let line = '';
    words.forEach(word => {
      if ((line + word).length > 32) {
        receipt += line.trim() + '\n';
        line = word + ' ';
      } else {
        line += word + ' ';
      }
    });
    if (line.trim()) receipt += line.trim() + '\n';
    
    receipt += '\n';
    receipt += commands.ALIGN_CENTER;
    const timestamp = new Date().toLocaleString();
    receipt += `${timestamp}\n`;
    receipt += '================================\n';
    receipt += '\n\n\n\n\n';
    receipt += commands.CUT;
    
    await printToDevice(receipt);
    
    res.json({ success: true, message: 'Fortune printed!', fortune });
  } catch (error) {
    console.error('Fortune error:', error.message);
    res.status(500).json({ error: 'Failed to print fortune', details: error.message });
  }
});

app.get('/test', async (req, res) => {
    let receipt = commands.INIT;
    receipt += '\n';
    receipt += '================================\n';
    receipt += '\n\n\n\n\n';
    receipt += commands.CUT;
    await printToDevice(receipt);
    res.json({ success: true, message: 'Test printed!' });

});

app.get('/fingus', async (req, res) => {
    let receipt = commands.INIT;
    receipt += '\n';
    receipt += '================================\n';
    receipt += '\n\n\n\n\n';
    receipt += commands.CUT;
    await printToDevice(receipt);
    res.json({ success: true, message: 'Test printed!' });

});

app.get('/bingus', async (req, res) => {
  console.log('test...');
});

// Print current time/date in big ASCII
app.get('/print-time', async (req, res) => {
  try {
    const now = new Date();
    const time = now.toLocaleTimeString();
    const date = now.toLocaleDateString();
    
    let receipt = commands.INIT;
    receipt += commands.ALIGN_CENTER;
    receipt += commands.BOLD_ON;
    receipt += '\n';
    receipt += '================================\n';
    receipt += '        CURRENT TIME\n';
    receipt += '================================\n';
    receipt += '\n';
    receipt += `     ${time}\n`;
    receipt += '\n';
    receipt += `     ${date}\n`;
    receipt += commands.BOLD_OFF;
    receipt += '================================\n';
    receipt += '\n\n\n\n\n';
    receipt += commands.CUT;
    
    await printToDevice(receipt);
    
    res.json({ success: true, message: 'Time printed!' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to print time', details: error.message });
  }
});

// Random joke printer
app.get('/print-joke', async (req, res) => {
  try {
    console.log('Fetching random joke...');
    
    // Using Official Joke API (free, no key required)
    const response = await axios.get('https://official-joke-api.appspot.com/random_joke');
    const joke = response.data;
    
    let receipt = commands.INIT;
    receipt += commands.ALIGN_CENTER;
    receipt += commands.BOLD_ON;
    receipt += '\n';
    receipt += '================================\n';
    receipt += '        JOKE TIME!\n';
    receipt += '================================\n';
    receipt += commands.BOLD_OFF;
    receipt += '\n';
    receipt += commands.ALIGN_LEFT;
    
    // Wrap setup text
    const setupWords = joke.setup.split(' ');
    let line = '';
    setupWords.forEach(word => {
      if ((line + word).length > 32) {
        receipt += line.trim() + '\n';
        line = word + ' ';
      } else {
        line += word + ' ';
      }
    });
    if (line.trim()) receipt += line.trim() + '\n';
    
    receipt += '\n';
    receipt += commands.BOLD_ON;
    
    // Wrap punchline text
    const punchlineWords = joke.punchline.split(' ');
    line = '';
    punchlineWords.forEach(word => {
      if ((line + word).length > 32) {
        receipt += line.trim() + '\n';
        line = word + ' ';
      } else {
        line += word + ' ';
      }
    });
    if (line.trim()) receipt += line.trim() + '\n';
    
    receipt += commands.BOLD_OFF;
    receipt += '\n';
    receipt += commands.ALIGN_CENTER;
    receipt += '================================\n';
    receipt += '\n\n\n\n\n';
    receipt += commands.CUT;
    
    await printToDevice(receipt);
    
    res.json({ success: true, message: 'Joke printed!', joke: { setup: joke.setup, punchline: joke.punchline } });
  } catch (error) {
    console.error('Joke error:', error.message);
    res.status(500).json({ error: 'Failed to print joke', details: error.message });
  }
});

// Shopping list endpoint
app.post('/print-shopping', async (req, res) => {
  try {
    console.log('Received body:', req.body);
    const { items } = req.body;
    
    if (!items) {
      return res.status(400).json({ error: 'Items field is required', received: req.body });
    }
    
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Items must be an array', received: typeof items });
    }
    
    if (items.length === 0) {
      return res.status(400).json({ error: 'Items array cannot be empty' });
    }
    
    console.log(`Printing shopping list with ${items.length} items`);
    
    let receipt = commands.INIT;
    receipt += commands.ALIGN_CENTER;
    receipt += commands.BOLD_ON;
    receipt += '\n';
    receipt += '================================\n';
    receipt += '      SHOPPING LIST\n';
    receipt += '================================\n';
    receipt += commands.BOLD_OFF;
    receipt += '\n';
    receipt += commands.ALIGN_LEFT;
    
    items.forEach((item, index) => {
      receipt += `[ ] ${index + 1}. ${item}\n`;
    });
    
    receipt += '\n';
    receipt += commands.ALIGN_CENTER;
    const timestamp = new Date().toLocaleString();
    receipt += `${timestamp}\n`;
    receipt += '================================\n';
    receipt += '\n\n\n\n\n';
    receipt += commands.CUT;
    
    await printToDevice(receipt);
    
    console.log('Shopping list printed successfully');
    res.json({ success: true, message: 'Shopping list printed!', itemCount: items.length });
  } catch (error) {
    console.error('Shopping list error:', error);
    res.status(500).json({ error: 'Failed to print shopping list', details: error.message });
  }
});

// Grocy shopping list endpoint
app.get('/print-grocy', async (req, res) => {
  try {
    if (!process.env.GROCY_API_KEY || !process.env.GROCY_URL) {
      return res.status(400).json({ 
        error: 'Grocy not configured', 
        message: 'Please set GROCY_API_KEY and GROCY_URL in .env file' 
      });
    }

    console.log('Fetching shopping list from Grocy...');
    
    // Fetch shopping list from Grocy API
    // Note: If behind Cloudflare Access, use CF_Authorization header
    const headers = {
      'accept': 'application/json'
    };
    
    // Check if the API key looks like a JWT (Cloudflare Access token)
    if (process.env.GROCY_API_KEY.startsWith('eyJ')) {
      headers['CF_Authorization'] = `Bearer ${process.env.GROCY_API_KEY}`;
    } else {
      headers['GROCY-API-KEY'] = process.env.GROCY_API_KEY;
    }
    
    const response = await axios.get(`${process.env.GROCY_URL}/api/objects/shopping_list`, {
      headers: headers
    });

    const shoppingList = response.data;
    
    if (!shoppingList || shoppingList.length === 0) {
      return res.json({ success: true, message: 'Shopping list is empty!' });
    }

    console.log(`Found ${shoppingList.length} items in Grocy`);
    console.log('Sample item:', JSON.stringify(shoppingList[0], null, 2));
    
    // Fetch product names for items that have product_id
    const productsMap = {};
    const productIds = [...new Set(shoppingList.map(item => item.product_id).filter(Boolean))];
    
    if (productIds.length > 0) {
      const productsResponse = await axios.get(`${process.env.GROCY_URL}/api/objects/products`, {
        headers: headers
      });
      productsResponse.data.forEach(product => {
        productsMap[product.id] = product.name;
      });
    }
    
    let receipt = commands.INIT;
    receipt += commands.ALIGN_CENTER;
    receipt += commands.BOLD_ON;
    receipt += '\n';
    receipt += '================================\n';
    receipt += '    GROCY SHOPPING LIST\n';
    receipt += '================================\n';
    receipt += commands.BOLD_OFF;
    receipt += '\n';
    receipt += commands.ALIGN_LEFT;
    
    // Filter out items with 0 or no amount
    const itemsInStock = shoppingList.filter(item => item.amount && item.amount > 0);
    
    if (itemsInStock.length === 0) {
      return res.json({ success: true, message: 'No items in stock to print!' });
    }
    
    itemsInStock.forEach((item, index) => {
      const productName = productsMap[item.product_id] || item.note || 'Unknown Item';
      const amount = item.amount ? ` (${item.amount})` : '';
      receipt += `[ ] ${index + 1}. ${productName}${amount}\n`;
    });
    
    receipt += '\n';
    receipt += commands.ALIGN_CENTER;
    const timestamp = new Date().toLocaleString();
    receipt += `${timestamp}\n`;
    receipt += `Total items: ${itemsInStock.length}\n`;
    receipt += '================================\n';
    receipt += '\n\n\n\n\n';
    receipt += commands.CUT;
    
    await printToDevice(receipt);
    
    console.log('Grocy shopping list printed successfully');
    res.json({ 
      success: true, 
      message: 'Grocy shopping list printed!', 
      itemCount: itemsInStock.length 
    });
  } catch (error) {
    console.error('Grocy error:', error.message);
    if (error.response) {
      res.status(500).json({ 
        error: 'Failed to fetch from Grocy', 
        details: error.response.data,
        status: error.response.status
      });
    } else {
      res.status(500).json({ 
        error: 'Failed to print Grocy shopping list', 
        details: error.message 
      });
    }
  }
});

// Grocy stock inventory endpoint
app.get('/print-stock', async (req, res) => {
  try {
    if (!process.env.GROCY_API_KEY || !process.env.GROCY_URL) {
      return res.status(400).json({ 
        error: 'Grocy not configured', 
        message: 'Please set GROCY_API_KEY and GROCY_URL in .env file' 
      });
    }

    console.log('Fetching stock from Grocy...');
    
    const headers = {
      'accept': 'application/json'
    };
    
    if (process.env.GROCY_API_KEY.startsWith('eyJ')) {
      headers['CF_Authorization'] = `Bearer ${process.env.GROCY_API_KEY}`;
    } else {
      headers['GROCY-API-KEY'] = process.env.GROCY_API_KEY;
    }
    
    // Fetch current stock
    const stockResponse = await axios.get(`${process.env.GROCY_URL}/api/stock`, {
      headers: headers
    });

    const stock = stockResponse.data;
    
    if (!stock || stock.length === 0) {
      return res.json({ success: true, message: 'No items in stock!' });
    }

    // Filter out items with 0 or less stock
    const itemsInStock = stock.filter(item => 
      item.amount && parseFloat(item.amount) > 0
    );
    
    if (itemsInStock.length === 0) {
      return res.json({ success: true, message: 'No items with stock > 0!' });
    }

    console.log(`Found ${itemsInStock.length} items in stock`);
    
    let receipt = commands.INIT;
    receipt += commands.ALIGN_CENTER;
    receipt += commands.BOLD_ON;
    receipt += '\n';
    receipt += '================================\n';
    receipt += '    GROCY STOCK INVENTORY\n';
    receipt += '================================\n';
    receipt += commands.BOLD_OFF;
    receipt += '\n';
    receipt += commands.ALIGN_LEFT;
    
    itemsInStock.forEach((item, index) => {
      const name = item.product ? item.product.name : 'Unknown';
      const amount = item.amount ? parseFloat(item.amount).toFixed(1) : '0';
      const unit = item.quantity_unit_stock ? item.quantity_unit_stock.name : '';
      const location = item.product && item.product.location ? item.product.location.name : '';
      
      receipt += `${index + 1}. ${name}\n`;
      receipt += `   Stock: ${amount} ${unit}`;
      if (location) {
        receipt += ` (${location})`;
      }
      receipt += '\n\n';
    });
    
    receipt += commands.ALIGN_CENTER;
    const timestamp = new Date().toLocaleString();
    receipt += `${timestamp}\n`;
    receipt += `Total products: ${itemsInStock.length}\n`;
    receipt += '================================\n';
    receipt += '\n\n\n\n\n';
    receipt += commands.CUT;
    
    await printToDevice(receipt);
    
    console.log('Grocy stock inventory printed successfully');
    res.json({ 
      success: true, 
      message: 'Stock inventory printed!', 
      itemCount: itemsInStock.length 
    });
  } catch (error) {
    console.error('Grocy stock error:', error.message);
    if (error.response) {
      res.status(500).json({ 
        error: 'Failed to fetch stock from Grocy', 
        details: error.response.data,
        status: error.response.status
      });
    } else {
      res.status(500).json({ 
        error: 'Failed to print stock inventory', 
        details: error.message 
      });
    }
  }
});

// NVIDIA stock chart endpoint
app.get('/print-nvidia-stock', async (req, res) => {
  try {
    console.log('Fetching NVIDIA stock data...');
    
    // Using Yahoo Finance API (free, no key required)
    const symbol = 'NVDA';
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1mo`;
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });

    const result = response.data.chart.result[0];
    const meta = result.meta;
    const quotes = result.indicators.quote[0];
    const timestamps = result.timestamp;
    
    // Get last 10 trading days for cleaner display
    const dataPoints = Math.min(10, timestamps.length);
    const prices = quotes.close.slice(-dataPoints);
    const dates = timestamps.slice(-dataPoints);
    
    const currentPrice = meta.regularMarketPrice;
    const previousClose = meta.previousClose || meta.chartPreviousClose;
    const change = currentPrice - previousClose;
    const changePercent = ((change / previousClose) * 100).toFixed(2);
    
    // Calculate price range for scaling
    const validPrices = prices.filter(p => p !== null);
    const minPrice = Math.min(...validPrices);
    const maxPrice = Math.max(...validPrices);
    const priceRange = maxPrice - minPrice;
    
    // Build the graph
    let receipt = commands.INIT;
    receipt += commands.ALIGN_CENTER;
    receipt += commands.BOLD_ON;
    receipt += '\n';
    receipt += '================================\n';
    receipt += `    NVIDIA (${symbol}) STOCK\n`;
    receipt += '================================\n';
    receipt += commands.BOLD_OFF;
    receipt += '\n';
    
    // Current price info
    receipt += commands.BOLD_ON;
    receipt += `$${currentPrice.toFixed(2)}\n`;
    receipt += commands.BOLD_OFF;
    const changeSymbol = change >= 0 ? '+' : '';
    const arrow = change >= 0 ? '^' : 'v';
    receipt += `${arrow} ${changeSymbol}$${change.toFixed(2)} (${changeSymbol}${changePercent}%)\n`;
    receipt += '\n';
    receipt += `30d High: $${maxPrice.toFixed(2)}\n`;
    receipt += `30d Low:  $${minPrice.toFixed(2)}\n`;
    receipt += '================================\n';
    receipt += '\n';
    receipt += commands.ALIGN_LEFT;
    
    // Draw horizontal bar chart showing last 10 days
    receipt += 'Last 10 Trading Days:\n';
    receipt += '(Bars show price level)\n';
    receipt += '\n';
    
    // Find max bar width
    const maxBarWidth = 22;
    
    for (let i = 0; i < dataPoints; i++) {
      const price = prices[i];
      if (price === null) continue;
      
      const date = new Date(dates[i] * 1000);
      const dateStr = `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}`;
      
      // Calculate bar length based on price
      const normalized = (price - minPrice) / priceRange;
      const barLength = Math.max(1, Math.round(normalized * maxBarWidth));
      
      // Create bar using standard ASCII characters
      const bar = '#'.repeat(barLength);
      const priceStr = `$${price.toFixed(2)}`;
      
      receipt += `${dateStr} ${bar} ${priceStr}\n`;
    }
    
    receipt += '\n';
    receipt += 'Scale:\n';
    receipt += `$${minPrice.toFixed(0)}` + '-'.repeat(15) + `$${maxPrice.toFixed(0)}\n`;
    receipt += '\n';
    
    receipt += commands.ALIGN_CENTER;
    const timestamp = new Date().toLocaleString();
    receipt += `${timestamp}\n`;
    receipt += 'Data: Yahoo Finance\n';
    receipt += '================================\n';
    receipt += '\n\n\n\n\n';
    receipt += commands.CUT;
    
    await printToDevice(receipt);
    
    console.log('NVIDIA stock chart printed successfully');
    res.json({ 
      success: true, 
      message: 'NVIDIA stock chart printed!',
      currentPrice: currentPrice,
      change: change,
      changePercent: changePercent
    });
  } catch (error) {
    console.error('Stock chart error:', error.message);
    res.status(500).json({ 
      error: 'Failed to print stock chart', 
      details: error.message 
    });
  }
});

// Weather forecast for Engesvang, Denmark
app.get('/print-weather', async (req, res) => {
  try {
    console.log('Fetching weather for Engesvang, Denmark...');
    
    // Using Open-Meteo API (free, no key required)
    // Coordinates for Engesvang, 7442
    const lat = 56.0833;
    const lon = 9.4167;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Europe/Copenhagen`;
    
    const response = await axios.get(url);
    const data = response.data;
    
    const current = data.current;
    const daily = data.daily;
    
    // Weather code mapping (WMO codes)
    const weatherCodes = {
      0: 'Clear sky',
      1: 'Mainly clear',
      2: 'Partly cloudy',
      3: 'Overcast',
      45: 'Foggy',
      48: 'Foggy',
      51: 'Light drizzle',
      53: 'Drizzle',
      55: 'Heavy drizzle',
      61: 'Light rain',
      63: 'Rain',
      65: 'Heavy rain',
      71: 'Light snow',
      73: 'Snow',
      75: 'Heavy snow',
      77: 'Snow grains',
      80: 'Rain showers',
      81: 'Rain showers',
      82: 'Heavy showers',
      85: 'Snow showers',
      86: 'Heavy snow',
      95: 'Thunderstorm',
      96: 'Thunderstorm',
      99: 'Thunderstorm'
    };
    
    const currentWeather = weatherCodes[current.weather_code] || 'Unknown';
    
    let receipt = commands.INIT;
    receipt += commands.ALIGN_CENTER;
    receipt += commands.BOLD_ON;
    receipt += '\n';
    receipt += '================================\n';
    receipt += '      WEATHER FORECAST\n';
    receipt += '   Engesvang, Denmark 7442\n';
    receipt += '================================\n';
    receipt += commands.BOLD_OFF;
    receipt += '\n';
    
    // Current weather
    receipt += commands.BOLD_ON;
    receipt += 'CURRENT CONDITIONS\n';
    receipt += commands.BOLD_OFF;
    receipt += '\n';
    receipt += commands.ALIGN_LEFT;
    receipt += `Conditions: ${currentWeather}\n`;
    receipt += `Temperature: ${current.temperature_2m.toFixed(1)}C\n`;
    receipt += `Feels like: ${current.apparent_temperature.toFixed(1)}C\n`;
    receipt += `Humidity: ${current.relative_humidity_2m}%\n`;
    receipt += `Wind: ${current.wind_speed_10m.toFixed(1)} km/h\n`;
    if (current.precipitation > 0) {
      receipt += `Precipitation: ${current.precipitation} mm\n`;
    }
    receipt += '\n';
    
    // 3-day forecast
    receipt += commands.ALIGN_CENTER;
    receipt += commands.BOLD_ON;
    receipt += '3-DAY FORECAST\n';
    receipt += commands.BOLD_OFF;
    receipt += commands.ALIGN_LEFT;
    receipt += '\n';
    
    for (let i = 0; i < 3; i++) {
      const date = new Date(daily.time[i]);
      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const weather = weatherCodes[daily.weather_code[i]] || 'Unknown';
      const tempMax = daily.temperature_2m_max[i].toFixed(0);
      const tempMin = daily.temperature_2m_min[i].toFixed(0);
      const precip = daily.precipitation_sum[i].toFixed(1);
      
      receipt += `${dayName}, ${dateStr}\n`;
      receipt += `  ${weather}\n`;
      receipt += `  High: ${tempMax}C  Low: ${tempMin}C\n`;
      if (parseFloat(precip) > 0) {
        receipt += `  Rain: ${precip} mm\n`;
      }
      receipt += '\n';
    }
    
    receipt += commands.ALIGN_CENTER;
    const timestamp = new Date().toLocaleString();
    receipt += `${timestamp}\n`;
    receipt += 'Data: Open-Meteo.com\n';
    receipt += '================================\n';
    receipt += '\n\n\n\n\n';
    receipt += commands.CUT;
    
    await printToDevice(receipt);
    
    console.log('Weather forecast printed successfully');
    res.json({ 
      success: true, 
      message: 'Weather forecast printed!',
      current: {
        temp: current.temperature_2m,
        conditions: currentWeather
      }
    });
  } catch (error) {
    console.error('Weather error:', error.message);
    res.status(500).json({ 
      error: 'Failed to print weather', 
      details: error.message 
    });
  }
});

// Random fact from the internet
app.get('/print-fact', async (req, res) => {
  try {
    console.log('Fetching random fact...');
    
    // Using uselessfacts.jsph.pl API (free, no key required)
    const response = await axios.get('https://uselessfacts.jsph.pl/random.json?language=en');
    const fact = response.data.text;
    
    let receipt = commands.INIT;
    receipt += commands.ALIGN_CENTER;
    receipt += commands.BOLD_ON;
    receipt += '\n';
    receipt += '================================\n';
    receipt += '      DID YOU KNOW?\n';
    receipt += '================================\n';
    receipt += commands.BOLD_OFF;
    receipt += '\n';
    receipt += commands.ALIGN_LEFT;
    
    // Wrap text to fit printer width
    const words = fact.split(' ');
    let line = '';
    let lines = [];
    
    words.forEach(word => {
      if ((line + word).length > 32) {
        lines.push(line.trim());
        line = word + ' ';
      } else {
        line += word + ' ';
      }
    });
    if (line.trim()) lines.push(line.trim());
    
    lines.forEach(l => {
      receipt += l + '\n';
    });
    
    receipt += '\n';
    receipt += commands.ALIGN_CENTER;
    const timestamp = new Date().toLocaleString();
    receipt += `${timestamp}\n`;
    receipt += '================================\n';
    receipt += '\n\n\n\n\n';
    receipt += commands.CUT;
    
    await printToDevice(receipt);
    
    console.log('Random fact printed successfully');
    res.json({ 
      success: true, 
      message: 'Random fact printed!',
      fact: fact
    });
  } catch (error) {
    console.error('Fact error:', error.message);
    res.status(500).json({ 
      error: 'Failed to print fact', 
      details: error.message 
    });
  }
});

// Roll dice
app.get('/print-dice', async (req, res) => {
  try {
    console.log('Rolling dice...');
    
    const dice = req.query.dice || '2d6'; // Default: 2 six-sided dice
    const match = dice.match(/(\d+)d(\d+)/);
    
    if (!match) {
      return res.status(400).json({ error: 'Invalid dice format. Use format like: 2d6, 1d20, 3d8' });
    }
    
    const numDice = parseInt(match[1]);
    const numSides = parseInt(match[2]);
    
    if (numDice > 20 || numSides > 100) {
      return res.status(400).json({ error: 'Max 20 dice and 100 sides' });
    }
    
    const rolls = [];
    let total = 0;
    
    for (let i = 0; i < numDice; i++) {
      const roll = Math.floor(Math.random() * numSides) + 1;
      rolls.push(roll);
      total += roll;
    }
    
    let receipt = commands.INIT;
    receipt += commands.ALIGN_CENTER;
    receipt += commands.BOLD_ON;
    receipt += '\n';
    receipt += '================================\n';
    receipt += '        DICE ROLLER\n';
    receipt += '================================\n';
    receipt += commands.BOLD_OFF;
    receipt += '\n';
    receipt += `Rolling ${numDice}d${numSides}\n`;
    receipt += '\n';
    receipt += commands.BOLD_ON;
    receipt += `TOTAL: ${total}\n`;
    receipt += commands.BOLD_OFF;
    receipt += '\n';
    receipt += commands.ALIGN_LEFT;
    receipt += 'Individual rolls:\n';
    rolls.forEach((roll, i) => {
      receipt += `  Die ${i + 1}: ${roll}\n`;
    });
    receipt += '\n';
    receipt += commands.ALIGN_CENTER;
    const timestamp = new Date().toLocaleString();
    receipt += `${timestamp}\n`;
    receipt += '================================\n';
    receipt += '\n\n\n\n\n';
    receipt += commands.CUT;
    
    await printToDevice(receipt);
    
    res.json({ success: true, message: 'Dice rolled!', total, rolls });
  } catch (error) {
    console.error('Dice error:', error.message);
    res.status(500).json({ error: 'Failed to roll dice', details: error.message });
  }
});

// Magic 8-ball
app.get('/print-8ball', async (req, res) => {
  try {
    const question = req.query.q || 'Will today be a good day?';
    
    const answers = [
      'It is certain',
      'Without a doubt',
      'Yes definitely',
      'You may rely on it',
      'As I see it, yes',
      'Most likely',
      'Outlook good',
      'Yes',
      'Signs point to yes',
      'Reply hazy, try again',
      'Ask again later',
      'Better not tell you now',
      'Cannot predict now',
      'Concentrate and ask again',
      "Don't count on it",
      'My reply is no',
      'My sources say no',
      'Outlook not so good',
      'Very doubtful'
    ];
    
    const answer = answers[Math.floor(Math.random() * answers.length)];
    
    let receipt = commands.INIT;
    receipt += commands.ALIGN_CENTER;
    receipt += commands.BOLD_ON;
    receipt += '\n';
    receipt += '================================\n';
    receipt += '       MAGIC 8-BALL\n';
    receipt += '================================\n';
    receipt += commands.BOLD_OFF;
    receipt += '\n';
    receipt += commands.ALIGN_LEFT;
    receipt += 'Question:\n';
    
    // Wrap question
    const words = question.split(' ');
    let line = '';
    words.forEach(word => {
      if ((line + word).length > 32) {
        receipt += line.trim() + '\n';
        line = word + ' ';
      } else {
        line += word + ' ';
      }
    });
    if (line.trim()) receipt += line.trim() + '\n';
    
    receipt += '\n';
    receipt += commands.ALIGN_CENTER;
    receipt += commands.BOLD_ON;
    receipt += `${answer}\n`;
    receipt += commands.BOLD_OFF;
    receipt += '\n';
    const timestamp = new Date().toLocaleString();
    receipt += `${timestamp}\n`;
    receipt += '================================\n';
    receipt += '\n\n\n\n\n';
    receipt += commands.CUT;
    
    await printToDevice(receipt);
    
    res.json({ success: true, message: '8-ball answered!', question, answer });
  } catch (error) {
    console.error('8-ball error:', error.message);
    res.status(500).json({ error: 'Failed to consult 8-ball', details: error.message });
  }
});

// Coin flip
app.get('/print-coinflip', async (req, res) => {
  try {
    const result = Math.random() < 0.5 ? 'HEADS' : 'TAILS';
    
    let receipt = commands.INIT;
    receipt += commands.ALIGN_CENTER;
    receipt += commands.BOLD_ON;
    receipt += '\n';
    receipt += '================================\n';
    receipt += '        COIN FLIP\n';
    receipt += '================================\n';
    receipt += commands.BOLD_OFF;
    receipt += '\n';
    receipt += '\n';
    receipt += commands.BOLD_ON;
    receipt += `    ${result}\n`;
    receipt += commands.BOLD_OFF;
    receipt += '\n';
    receipt += '\n';
    const timestamp = new Date().toLocaleString();
    receipt += `${timestamp}\n`;
    receipt += '================================\n';
    receipt += '\n\n\n\n\n';
    receipt += commands.CUT;
    
    await printToDevice(receipt);
    
    res.json({ success: true, message: 'Coin flipped!', result });
  } catch (error) {
    console.error('Coin flip error:', error.message);
    res.status(500).json({ error: 'Failed to flip coin', details: error.message });
  }
});

// Random trivia question
app.get('/print-trivia', async (req, res) => {
  try {
    console.log('Fetching trivia question...');
    
    const response = await axios.get('https://opentdb.com/api.php?amount=1&type=multiple');
    const trivia = response.data.results[0];
    
    // Decode HTML entities
    const decodeHTML = (text) => text
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
    
    const question = decodeHTML(trivia.question);
    const correctAnswer = decodeHTML(trivia.correct_answer);
    const incorrectAnswers = trivia.incorrect_answers.map(decodeHTML);
    const allAnswers = [correctAnswer, ...incorrectAnswers].sort(() => Math.random() - 0.5);
    const correctLetter = String.fromCharCode(65 + allAnswers.indexOf(correctAnswer));
    
    let receipt = commands.INIT;
    receipt += commands.ALIGN_CENTER;
    receipt += commands.BOLD_ON;
    receipt += '\n';
    receipt += '================================\n';
    receipt += '      TRIVIA QUESTION\n';
    receipt += '================================\n';
    receipt += commands.BOLD_OFF;
    receipt += `Category: ${trivia.category}\n`;
    receipt += `Difficulty: ${trivia.difficulty}\n`;
    receipt += '\n';
    receipt += commands.ALIGN_LEFT;
    
    // Wrap question
    const words = question.split(' ');
    let line = '';
    words.forEach(word => {
      if ((line + word).length > 32) {
        receipt += line.trim() + '\n';
        line = word + ' ';
      } else {
        line += word + ' ';
      }
    });
    if (line.trim()) receipt += line.trim() + '\n';
    
    receipt += '\n';
    allAnswers.forEach((answer, i) => {
      const letter = String.fromCharCode(65 + i);
      receipt += `${letter}) ${answer}\n`;
    });
    
    receipt += '\n';
    receipt += '--------------------------------\n';
    receipt += commands.BOLD_ON;
    receipt += `Answer: ${correctLetter}) ${correctAnswer}\n`;
    receipt += commands.BOLD_OFF;
    receipt += '\n';
    receipt += commands.ALIGN_CENTER;
    const timestamp = new Date().toLocaleString();
    receipt += `${timestamp}\n`;
    receipt += 'Data: Open Trivia Database\n';
    receipt += '================================\n';
    receipt += '\n\n\n\n\n';
    receipt += commands.CUT;
    
    await printToDevice(receipt);
    
    res.json({ success: true, message: 'Trivia printed!', question, answer: correctAnswer });
  } catch (error) {
    console.error('Trivia error:', error.message);
    res.status(500).json({ error: 'Failed to print trivia', details: error.message });
  }
});

// Daily affirmation
app.get('/print-affirmation', async (req, res) => {
  try {
    console.log('Fetching affirmation...');
    
    const response = await axios.get('https://www.affirmations.dev/');
    const affirmation = response.data.affirmation;
    
    let receipt = commands.INIT;
    receipt += commands.ALIGN_CENTER;
    receipt += commands.BOLD_ON;
    receipt += '\n';
    receipt += '================================\n';
    receipt += '    DAILY AFFIRMATION\n';
    receipt += '================================\n';
    receipt += commands.BOLD_OFF;
    receipt += '\n';
    receipt += commands.ALIGN_LEFT;
    
    // Wrap text
    const words = affirmation.split(' ');
    let line = '';
    words.forEach(word => {
      if ((line + word).length > 32) {
        receipt += line.trim() + '\n';
        line = word + ' ';
      } else {
        line += word + ' ';
      }
    });
    if (line.trim()) receipt += line.trim() + '\n';
    
    receipt += '\n';
    receipt += commands.ALIGN_CENTER;
    const timestamp = new Date().toLocaleString();
    receipt += `${timestamp}\n`;
    receipt += '================================\n';
    receipt += '\n\n\n\n\n';
    receipt += commands.CUT;
    
    await printToDevice(receipt);
    
    res.json({ success: true, message: 'Affirmation printed!', affirmation });
  } catch (error) {
    console.error('Affirmation error:', error.message);
    res.status(500).json({ error: 'Failed to print affirmation', details: error.message });
  }
});

// NASA Astronomy Picture of the Day info
app.get('/print-apod', async (req, res) => {
  try {
    console.log('Fetching NASA APOD...');
    
    // NASA APOD API (free, demo key available)
    const response = await axios.get('https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY');
    const apod = response.data;
    
    let receipt = commands.INIT;
    receipt += commands.ALIGN_CENTER;
    receipt += commands.BOLD_ON;
    receipt += '\n';
    receipt += '================================\n';
    receipt += '    NASA PICTURE OF THE DAY\n';
    receipt += '================================\n';
    receipt += commands.BOLD_OFF;
    receipt += '\n';
    receipt += commands.BOLD_ON;
    receipt += apod.title + '\n';
    receipt += commands.BOLD_OFF;
    receipt += apod.date + '\n';
    receipt += '\n';
    receipt += commands.ALIGN_LEFT;
    
    // Wrap explanation text
    const words = apod.explanation.split(' ');
    let line = '';
    
    words.forEach(word => {
      if ((line + word).length > 32) {
        receipt += line.trim() + '\n';
        line = word + ' ';
      } else {
        line += word + ' ';
      }
    });
    if (line.trim()) receipt += line.trim() + '\n';
    
    receipt += '\n';
    receipt += commands.ALIGN_CENTER;
    receipt += 'Copyright: ' + (apod.copyright || 'Public Domain') + '\n';
    receipt += '\n';
    const timestamp = new Date().toLocaleString();
    receipt += `${timestamp}\n`;
    receipt += 'Data: NASA APOD\n';
    receipt += '================================\n';
    receipt += '\n\n\n\n\n';
    receipt += commands.CUT;
    
    await printToDevice(receipt);
    
    console.log('NASA APOD printed successfully');
    res.json({ 
      success: true, 
      message: 'NASA APOD printed!',
      title: apod.title
    });
  } catch (error) {
    console.error('APOD error:', error.message);
    res.status(500).json({ 
      error: 'Failed to print APOD', 
      details: error.message 
    });
  }
});

// Cryptocurrency prices
app.get('/print-crypto', async (req, res) => {
  try {
    console.log('Fetching crypto prices...');
    
    const coins = req.query.coins || 'bitcoin,ethereum,dogecoin';
    const response = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${coins}&vs_currencies=usd,eur&include_24hr_change=true`);
    const data = response.data;
    
    let receipt = commands.INIT;
    receipt += commands.ALIGN_CENTER;
    receipt += commands.BOLD_ON;
    receipt += '\n';
    receipt += '================================\n';
    receipt += '    CRYPTO PRICES\n';
    receipt += '================================\n';
    receipt += commands.BOLD_OFF;
    receipt += '\n';
    receipt += commands.ALIGN_LEFT;
    
    Object.keys(data).forEach(coin => {
      const coinData = data[coin];
      const name = coin.charAt(0).toUpperCase() + coin.slice(1);
      const price = coinData.usd;
      const change = coinData.usd_24h_change;
      const arrow = change >= 0 ? '^' : 'v';
      const changeSymbol = change >= 0 ? '+' : '';
      
      receipt += commands.BOLD_ON;
      receipt += `${name}\n`;
      receipt += commands.BOLD_OFF;
      receipt += `  USD: $${price.toLocaleString()}\n`;
      receipt += `  EUR: €${coinData.eur.toLocaleString()}\n`;
      receipt += `  24h: ${arrow} ${changeSymbol}${change.toFixed(2)}%\n`;
      receipt += '\n';
    });
    
    receipt += commands.ALIGN_CENTER;
    const timestamp = new Date().toLocaleString();
    receipt += `${timestamp}\n`;
    receipt += 'Data: CoinGecko\n';
    receipt += '================================\n';
    receipt += '\n\n\n\n\n';
    receipt += commands.CUT;
    
    await printToDevice(receipt);
    
    res.json({ success: true, message: 'Crypto prices printed!' });
  } catch (error) {
    console.error('Crypto error:', error.message);
    res.status(500).json({ error: 'Failed to print crypto prices', details: error.message });
  }
});

// Moon phase
app.get('/print-moon', async (req, res) => {
  try {
    console.log('Fetching moon phase...');
    
    // Simple moon phase calculation
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    
    // Moon phase algorithm
    let c = 0;
    let e = 0;
    let jd = 0;
    let b = 0;
    
    if (month < 3) {
      const yr = year - 1;
      const mn = month + 12;
    } else {
      const yr = year;
      const mn = month;
    }
    
    const k1 = Math.floor(365.25 * (year + 4712));
    const k2 = Math.floor(30.6 * month + 0.5);
    const k3 = Math.floor(Math.floor((year / 100) + 49) * 0.75) - 38;
    
    jd = k1 + k2 + day + 59;
    if (jd > 2299160) jd -= k3;
    
    const ip = ((jd - 2451550.1) / 29.530588853);
    const age = (ip - Math.floor(ip)) * 29.530588853;
    
    const phases = [
      { name: 'New Moon', emoji: 'O', range: [0, 1.84] },
      { name: 'Waxing Crescent', emoji: ')', range: [1.84, 5.53] },
      { name: 'First Quarter', emoji: 'D', range: [5.53, 9.23] },
      { name: 'Waxing Gibbous', emoji: '(', range: [9.23, 12.91] },
      { name: 'Full Moon', emoji: '●', range: [12.91, 16.61] },
      { name: 'Waning Gibbous', emoji: ')', range: [16.61, 20.30] },
      { name: 'Last Quarter', emoji: 'C', range: [20.30, 23.99] },
      { name: 'Waning Crescent', emoji: '(', range: [23.99, 29.53] }
    ];
    
    let currentPhase = phases[0];
    for (const phase of phases) {
      if (age >= phase.range[0] && age < phase.range[1]) {
        currentPhase = phase;
        break;
      }
    }
    
    const illumination = (1 - Math.cos((age / 29.530588853) * 2 * Math.PI)) / 2 * 100;
    
    let receipt = commands.INIT;
    receipt += commands.ALIGN_CENTER;
    receipt += commands.BOLD_ON;
    receipt += '\n';
    receipt += '================================\n';
    receipt += '       MOON PHASE\n';
    receipt += '================================\n';
    receipt += commands.BOLD_OFF;
    receipt += '\n';
    receipt += commands.BOLD_ON;
    receipt += `${currentPhase.name}\n`;
    receipt += commands.BOLD_OFF;
    receipt += '\n';
    receipt += `Age: ${age.toFixed(1)} days\n`;
    receipt += `Illumination: ${illumination.toFixed(0)}%\n`;
    receipt += '\n';
    const timestamp = new Date().toLocaleString();
    receipt += `${timestamp}\n`;
    receipt += '================================\n';
    receipt += '\n\n\n\n\n';
    receipt += commands.CUT;
    
    await printToDevice(receipt);
    
    res.json({ success: true, message: 'Moon phase printed!', phase: currentPhase.name, age: age.toFixed(1) });
  } catch (error) {
    console.error('Moon phase error:', error.message);
    res.status(500).json({ error: 'Failed to print moon phase', details: error.message });
  }
});

// ISS location
app.get('/print-iss', async (req, res) => {
  try {
    console.log('Fetching ISS location...');
    
    const response = await axios.get('http://api.open-notify.org/iss-now.json');
    const data = response.data;
    
    const lat = parseFloat(data.iss_position.latitude);
    const lon = parseFloat(data.iss_position.longitude);
    
    // Reverse geocode to get location name
    let locationName = 'Over ocean or remote area';
    try {
      const geoResponse = await axios.get(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`, {
        timeout: 3000
      });
      
      if (geoResponse.data) {
        const geo = geoResponse.data;
        if (geo.city && geo.countryName) {
          locationName = `${geo.city}, ${geo.countryName}`;
        } else if (geo.locality && geo.countryName) {
          locationName = `${geo.locality}, ${geo.countryName}`;
        } else if (geo.countryName) {
          locationName = `Over ${geo.countryName}`;
        } else if (geo.ocean) {
          locationName = `Over ${geo.ocean}`;
        }
      }
    } catch (geoError) {
      console.log('Geocoding failed:', geoError.message);
    }
    
    let receipt = commands.INIT;
    receipt += commands.ALIGN_CENTER;
    receipt += commands.BOLD_ON;
    receipt += '\n';
    receipt += '================================\n';
    receipt += '   ISS LOCATION (LIVE)\n';
    receipt += '================================\n';
    receipt += commands.BOLD_OFF;
    receipt += '\n';
    receipt += commands.ALIGN_LEFT;
    receipt += `Latitude:  ${lat.toFixed(4)}°\n`;
    receipt += `Longitude: ${lon.toFixed(4)}°\n`;
    receipt += '\n';
    receipt += commands.BOLD_ON;
    receipt += 'Location:\n';
    receipt += commands.BOLD_OFF;
    
    // Wrap location name
    const words = locationName.split(' ');
    let line = '';
    words.forEach(word => {
      if ((line + word).length > 32) {
        receipt += line.trim() + '\n';
        line = word + ' ';
      } else {
        line += word + ' ';
      }
    });
    if (line.trim()) receipt += line.trim() + '\n';
    
    receipt += '\n';
    receipt += 'The International Space Station\n';
    receipt += 'is orbiting Earth at ~400 km\n';
    receipt += 'altitude, traveling at 28,000\n';
    receipt += 'km/h (17,500 mph).\n';
    receipt += '\n';
    receipt += commands.ALIGN_CENTER;
    const timestamp = new Date().toLocaleString();
    receipt += `${timestamp}\n`;
    receipt += 'Data: Open Notify API\n';
    receipt += '================================\n';
    receipt += '\n\n\n\n\n';
    receipt += commands.CUT;
    
    await printToDevice(receipt);
    
    res.json({ success: true, message: 'ISS location printed!', position: { lat, lon } });
  } catch (error) {
    console.error('ISS error:', error.message);
    res.status(500).json({ error: 'Failed to print ISS location', details: error.message });
  }
});

// Random compliment
app.get('/print-compliment', async (req, res) => {
  try {
    console.log('Generating compliment...');
    
    // Using a simple local list since complimentr.com has SSL issues
    const compliments = [
      'You are an amazing person!',
      'Your smile is contagious!',
      'You light up the room!',
      'You have impeccable manners!',
      'You are making a difference!',
      'Your perspective is refreshing!',
      'You are an inspiration!',
      'You are really courageous!',
      'Your kindness is a balm to all who encounter it!',
      'You are all that and a super-size bag of chips!',
      'You are even more beautiful on the inside than on the outside!',
      'You have the best laugh!',
      'You are a great listener!',
      'You are appreciated!',
      'You are awesome!',
      'Everything would be better if more people were like you!',
      'You bring out the best in other people!',
      'Your ability to recall random factoids is impressive!',
      'You are a gift to those around you!',
      'You are enough!'
    ];
    
    const compliment = compliments[Math.floor(Math.random() * compliments.length)];
    
    let receipt = commands.INIT;
    receipt += commands.ALIGN_CENTER;
    receipt += commands.BOLD_ON;
    receipt += '\n';
    receipt += '================================\n';
    receipt += '      COMPLIMENT FOR YOU\n';
    receipt += '================================\n';
    receipt += commands.BOLD_OFF;
    receipt += '\n';
    receipt += commands.ALIGN_LEFT;
    
    // Wrap text
    const words = compliment.split(' ');
    let line = '';
    words.forEach(word => {
      if ((line + word).length > 32) {
        receipt += line.trim() + '\n';
        line = word + ' ';
      } else {
        line += word + ' ';
      }
    });
    if (line.trim()) receipt += line.trim() + '\n';
    
    receipt += '\n';
    receipt += commands.ALIGN_CENTER;
    receipt += commands.BOLD_ON;
    receipt += 'You are awesome!\n';
    receipt += commands.BOLD_OFF;
    receipt += '\n';
    const timestamp = new Date().toLocaleString();
    receipt += `${timestamp}\n`;
    receipt += '================================\n';
    receipt += '\n\n\n\n\n';
    receipt += commands.CUT;
    
    await printToDevice(receipt);
    
    res.json({ success: true, message: 'Compliment printed!', compliment });
  } catch (error) {
    console.error('Compliment error:', error.message);
    res.status(500).json({ error: 'Failed to print compliment', details: error.message });
  }
});

// Word of the day
app.get('/print-word', async (req, res) => {
  try {
    console.log('Fetching word of the day...');
    
    const response = await axios.get('https://api.wordnik.com/v4/words.json/wordOfTheDay?api_key=a2a73e7b926c924fad7001ca3111acd55af2ffabf50eb4ae5');
    const data = response.data;
    
    let receipt = commands.INIT;
    receipt += commands.ALIGN_CENTER;
    receipt += commands.BOLD_ON;
    receipt += '\n';
    receipt += '================================\n';
    receipt += '      WORD OF THE DAY\n';
    receipt += '================================\n';
    receipt += commands.BOLD_OFF;
    receipt += '\n';
    receipt += commands.BOLD_ON;
    receipt += `${data.word.toUpperCase()}\n`;
    receipt += commands.BOLD_OFF;
    receipt += '\n';
    receipt += commands.ALIGN_LEFT;
    
    if (data.definitions && data.definitions.length > 0) {
      const definition = data.definitions[0].text;
      const words = definition.split(' ');
      let line = '';
      words.forEach(word => {
        if ((line + word).length > 32) {
          receipt += line.trim() + '\n';
          line = word + ' ';
        } else {
          line += word + ' ';
        }
      });
      if (line.trim()) receipt += line.trim() + '\n';
    }
    
    receipt += '\n';
    receipt += commands.ALIGN_CENTER;
    const timestamp = new Date().toLocaleString();
    receipt += `${timestamp}\n`;
    receipt += 'Data: Wordnik\n';
    receipt += '================================\n';
    receipt += '\n\n\n\n\n';
    receipt += commands.CUT;
    
    await printToDevice(receipt);
    
    res.json({ success: true, message: 'Word of the day printed!', word: data.word });
  } catch (error) {
    console.error('Word error:', error.message);
    res.status(500).json({ error: 'Failed to print word', details: error.message });
  }
});

// Generate QR code
app.get('/print-qr', async (req, res) => {
  try {
    const text = req.query.text || req.query.url;
    
    if (!text) {
      return res.status(400).json({ error: 'Please provide text or url parameter' });
    }
    
    console.log('Generating QR code for:', text.substring(0, 50));
    
    // Use QR Server API to generate QR code image
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(text)}`;
    
    // Download QR code
    const response = await axios.get(qrUrl, { responseType: 'arraybuffer' });
    const tempQrPath = path.join(os.tmpdir(), `qr_${Date.now()}.png`);
    await fs.writeFile(tempQrPath, response.data);
    
    // Build receipt with header
    let receipt = commands.INIT;
    receipt += commands.ALIGN_CENTER;
    receipt += commands.BOLD_ON;
    receipt += '\n';
    receipt += '================================\n';
    receipt += '         QR CODE\n';
    receipt += '================================\n';
    receipt += commands.BOLD_OFF;
    receipt += '\n';
    
    // Add truncated text
    const displayText = text.length > 40 ? text.substring(0, 37) + '...' : text;
    receipt += `${displayText}\n`;
    receipt += '\n';
    
    // Process and add QR code image
    const imageData = await processImageForPrinter(tempQrPath, 256);
    const imageStartIndex = imageData.indexOf(GS + 'v');
    if (imageStartIndex > 0) {
      receipt += imageData.substring(imageStartIndex);
    } else {
      receipt += imageData;
    }
    
    // Clean up
    await fs.unlink(tempQrPath).catch(() => {});
    
    await printToDevice(receipt);
    
    res.json({ success: true, message: 'QR code printed!', text });
  } catch (error) {
    console.error('QR code error:', error.message);
    res.status(500).json({ error: 'Failed to print QR code', details: error.message });
  }
});

// Print image endpoint
app.post('/print-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Image file is required' });
    }

    console.log(`Printing uploaded image: ${req.file.originalname}`);
    
    const imageData = await processImageForPrinter(req.file.path);
    await printToDevice(imageData);
    
    // Clean up uploaded file
    await fs.unlink(req.file.path).catch(() => {});
    
    res.json({ success: true, message: 'Image printed successfully!' });

  } catch (error) {
    console.error('Print error:', error);
    res.status(500).json({ 
      error: 'Failed to print image', 
      details: error.message 
    });
  }
});

// Home Assistant webhook endpoint
app.post('/homeassistant', async (req, res) => {
  try {
    const { title, message, icon } = req.body;

    if (!message || message.trim() === '') {
      return res.status(400).json({ error: 'Message is required' });
    }

    const receiptData = formatHomeAssistant(
      title || 'Home Assistant', 
      message, 
      icon || ''
    );
    await printToDevice(receiptData);
    
    console.log(`Printed HA message: ${title || 'notification'}`);
    res.json({ success: true, message: 'Printed successfully!' });

  } catch (error) {
    console.error('Print error:', error);
    res.status(500).json({ 
      error: 'Failed to print', 
      details: error.message 
    });
  }
});

// Get available printers (for troubleshooting)
app.get('/printers', async (req, res) => {
  try {
    if (USE_CUPS) {
      // List CUPS printers via HTTP
      const cupsUrl = `https://${CUPS_SERVER}:${CUPS_PORT}/printers/`;
      res.json({ 
        message: 'Using CUPS printer on Raspberry Pi',
        printerName: PRINTER_NAME,
        cupsServer: CUPS_SERVER,
        cupsUrl: cupsUrl,
        directUrl: `https://${CUPS_SERVER}:${CUPS_PORT}/printers/${PRINTER_NAME}`
      });
      return;
    }
    const { stdout } = await execAsync('powershell -Command "Get-Printer | Select-Object Name, PortName | ConvertTo-Json"');
    const printers = JSON.parse(stdout);
    res.json({ printers: Array.isArray(printers) ? printers : [printers] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper function to get endpoint descriptions
function getEndpointDescription(path) {
  const descriptions = {
    '/print-quote': 'Print a motivational quote',
    '/print-fortune': 'Print a fortune cookie',
    '/print-time': 'Print current date/time',
    '/print-joke': 'Print a random joke',
    '/print-fact': 'Print a random fact',
    '/print-apod': 'Print NASA pic of the day',
    '/print-weather': 'Print weather for Engesvang',
    '/print-nvidia-stock': 'Print NVIDIA stock chart',
    '/print-grocy': 'Print Grocy shopping list',
    '/print-stock': 'Print Grocy stock inventory',
    '/print-dice': 'Roll dice (use ?dice=2d6)',
    '/print-8ball': 'Ask the magic 8-ball',
    '/print-coinflip': 'Flip a coin',
    '/print-trivia': 'Print trivia question',
    '/print-affirmation': 'Print daily affirmation',
    '/print-crypto': 'Print crypto prices',
    '/print-moon': 'Print current moon phase',
    '/print-iss': 'Print ISS location',
    '/print-compliment': 'Print a compliment',
    '/print-word': 'Print word of the day',
    '/print-qr': 'Generate QR code (use ?text=)'
  };
  return descriptions[path] || 'Print something cool';
}

// Discord Bot Setup
if (process.env.DISCORD_TOKEN && process.env.DISCORD_CHANNEL_ID) {
  const discordClient = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  discordClient.on('ready', () => {
    console.log(`🤖 Discord bot logged in as ${discordClient.user.tag}`);
    console.log(`📢 Monitoring channel: ${process.env.DISCORD_CHANNEL_ID}`);
  });

  discordClient.on('messageCreate', async (message) => {
    // Ignore bot messages and only monitor specified channel
    if (message.author.bot) return;
    if (message.channel.id !== process.env.DISCORD_CHANNEL_ID) return;

    try {
      const username = message.author.username;
      const content = message.content;
      
      // Check for image attachments
      if (message.attachments.size > 0) {
        for (const attachment of message.attachments.values()) {
          if (attachment.contentType && attachment.contentType.startsWith('image/')) {
            console.log(`🖼️ Printing image from ${username}: ${attachment.name}`);
            
            // Download image
            const response = await axios.get(attachment.url, { responseType: 'arraybuffer' });
            const tempImagePath = path.join(os.tmpdir(), `discord_${Date.now()}_${attachment.name}`);
            await fs.writeFile(tempImagePath, response.data);
            
            // Build receipt with header showing who sent it
            let receipt = commands.INIT;
            receipt += commands.ALIGN_CENTER;
            receipt += commands.BOLD_ON;
            receipt += '\n';
            receipt += '================================\n';
            receipt += '       DISCORD IMAGE\n';
            receipt += '================================\n';
            receipt += commands.BOLD_OFF;
            receipt += `From: ${username}\n`;
            receipt += `File: ${attachment.name}\n`;
            receipt += '\n';
            
            // Process and add image data
            const imageData = await processImageForPrinter(tempImagePath);
            // Extract just the image portion (skip the header from processImageForPrinter)
            const imageStartIndex = imageData.indexOf(GS + 'v');
            if (imageStartIndex > 0) {
              receipt += imageData.substring(imageStartIndex);
            } else {
              receipt += imageData;
            }
            
            await printToDevice(receipt);
            
            // Clean up
            await fs.unlink(tempImagePath).catch(() => {});
            
            await message.react('🖨️');
            await message.reply(`✅ Printed image: ${attachment.name}`);
          }
        }
        
        // If message has both image and text, print the text too
        if (content && content.trim() !== '') {
          const receiptData = formatDiscordMessage(username, content);
          await printToDevice(receiptData);
        }
        
        return;
      }
      
      // Check for commands
      if (content.startsWith('!')) {
        const command = content.toLowerCase().split(' ')[0];
        
        // Manual print command: !print Your reminder text
        if (command === '!print' && content.length > 7) {
          const reminderText = content.substring(7);
          const receiptData = formatReceipt(reminderText);
          await printToDevice(receiptData);
          await message.reply('✅ Printed your reminder!');
          await message.react('🖨️');
          return;
        }

        // Help command - dynamically list all available commands
        if (command === '!printhelp') {
          // Extract all routes dynamically
          const getRoutes = [];
          const postRoutes = [];
          
          app._router.stack.forEach((middleware) => {
            if (middleware.route) {
              const methods = Object.keys(middleware.route.methods);
              const path = middleware.route.path;
              
              // Skip home and endpoints pages
              if (path === '/' || path === '/endpoints' || path === '/printers') return;
              
              if (methods.includes('get')) {
                getRoutes.push(path);
              } else if (methods.includes('post')) {
                postRoutes.push(path);
              }
            }
          });
          
          const getCommands = getRoutes
            .map(r => `\`!${r.substring(1)}\` - ${getEndpointDescription(r)}`)
            .join('\n');
          
          const postCommands = postRoutes
            .map(r => {
              if (r === '/print') return '`!print <text>` - Print a custom reminder';
              if (r === '/print-shopping') return '`!print-shopping <item1, item2, ...>` - Print shopping list';
              if (r === '/homeassistant') return null; // Skip HA webhook
              return `\`!${r.substring(1)}\` - ${getEndpointDescription(r)}`;
            })
            .filter(Boolean)
            .join('\n');
          
          await message.reply(
            '**🖨️ CoolPrinter Commands:**\n\n' +
            '**GET Commands:**\n' +
            getCommands + '\n\n' +
            (postCommands ? '**POST Commands:**\n' + postCommands + '\n\n' : '') +
            '`!printhelp` - Show this help\n\n' +
            '📷 **Upload an image** to print it (auto-dithered!)\n' +
            '💬 *All messages auto-print by default*'
          );
          return;
        }
        
        // Dynamically handle all GET endpoints
        const commandParts = content.substring(1).split(' '); // Remove ! and split
        const commandPath = commandParts[0];
        const commandArgs = commandParts.slice(1).join(' ');
        
        let matchedRoute = null;
        let routeMethod = null;
        
        app._router.stack.forEach((middleware) => {
          if (middleware.route && middleware.route.path === `/${commandPath}`) {
            const methods = Object.keys(middleware.route.methods);
            if (methods.includes('get')) {
              matchedRoute = middleware.route.path;
              routeMethod = 'GET';
            } else if (methods.includes('post')) {
              matchedRoute = middleware.route.path;
              routeMethod = 'POST';
            }
          }
        });
        
        if (matchedRoute) {
          await message.react('⏳');
          try {
            let response;
            
            if (routeMethod === 'GET') {
              // Parse Discord arguments into query parameters
              let queryString = '';
              
              // Handle different argument formats
              if (commandArgs) {
                // For commands like: !print-qr text=hello or !print-dice dice=2d6
                if (commandArgs.includes('=')) {
                  const params = commandArgs.split(/\s+/);
                  const queryParams = [];
                  params.forEach(param => {
                    if (param.includes('=')) {
                      const [key, ...valueParts] = param.split('=');
                      const value = valueParts.join('=');
                      queryParams.push(`${key}=${encodeURIComponent(value)}`);
                    }
                  });
                  if (queryParams.length > 0) {
                    queryString = '?' + queryParams.join('&');
                  }
                } else {
                  // For commands like: !print-8ball Will I win the lottery?
                  // Treat the rest as a 'q' parameter for 8-ball
                  if (commandPath === 'print-8ball') {
                    queryString = `?q=${encodeURIComponent(commandArgs)}`;
                  }
                }
              }
              
              response = await axios.get(`http://localhost:${PORT}${matchedRoute}${queryString}`);
            } else if (routeMethod === 'POST') {
              // Handle POST endpoints with body parsing
              if (matchedRoute === '/print-shopping') {
                // Parse shopping list: !print-shopping milk, bread, eggs
                const itemsText = content.substring(command.length + 1).trim();
                if (!itemsText) {
                  await message.reply('❌ Please provide items: `!print-shopping milk, bread, eggs`');
                  return;
                }
                const items = itemsText.split(',').map(i => i.trim()).filter(Boolean);
                response = await axios.post(`http://localhost:${PORT}${matchedRoute}`, { items });
              } else if (matchedRoute === '/print') {
                // Already handled above
                return;
              }
            }
            
            await message.react('🖨️');
            await message.reply(`✅ Printed: ${response.data.message || 'Success!'}`);
          } catch (error) {
            await message.react('❌');
            await message.reply(`❌ Error: ${error.response?.data?.error || error.message}`);
          }
          return;
        }
        
        // Unknown command - provide helpful message
        await message.reply(`❌ Unknown command: \`${command}\`\nType \`!printhelp\` to see all available commands.`);
        return;
      }

      // Auto-print all messages (unless it's a command)
      
      console.log(`📨 Discord message from ${username}: ${content.substring(0, 50)}...`);
      
      const receiptData = formatDiscordMessage(username, content);
      await printToDevice(receiptData);
      
      // React to message to show it was printed
      await message.react('🖨️');
    } catch (error) {
      console.error('Error printing Discord message:', error);
      await message.react('❌');
    }
  });

  discordClient.login(process.env.DISCORD_TOKEN).catch(err => {
    console.error('Failed to login to Discord:', err.message);
  });
} else {
  console.log('ℹ️  Discord integration disabled (set DISCORD_TOKEN and DISCORD_CHANNEL_ID in .env to enable)');
}

// Start server
app.listen(PORT, () => {
  console.log(`🖨️  CoolPrinter server running on http://localhost:${PORT}`);
  console.log(`📝 Open your browser to start printing reminders!`);
  console.log(`🏠 Home Assistant webhook: http://localhost:${PORT}/homeassistant`);
  console.log(`💬 Discord integration: ${process.env.DISCORD_TOKEN ? 'ENABLED' : 'DISABLED'}`);
});
