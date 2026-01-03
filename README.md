# thermal-print-node

A Node.js thermal printer server for printing reminders, images, and notes to your Bixolon SRP350plus thermal printer. Includes Discord and Home Assistant integration, with support for both Windows local printing and remote CUPS printing on Raspberry Pi.

> **Note:** This project was developed with the assistance of AI tools. Some implementation choices and design decisions may reflect AI-generated suggestions.

## Driver

https://www.bixolon.com/download_view.php?idx=95&s_key=Driver

## Features

- Clean web interface for entering reminders and uploading images
- Instant printing to Bixolon SRP350plus thermal printer
- CUPS/Raspberry Pi support - Print remotely to CUPS server via IPP
- Discord bot integration - Auto-print messages and images from a specific channel
- Home Assistant webhook - Trigger prints from HA automations
- Image printing - Upload and print images with automatic dithering
- Fun endpoints - Quotes, jokes, weather, crypto prices, QR codes, and more
- Grocy integration - Print shopping lists and inventory from Grocy
- Automatic timestamp on each print
- ASCII art formatting
- Emoji to text conversion for thermal printer compatibility

## Prerequisites

- Node.js (v14 or higher)
- Bixolon SRP350plus printer connected via:
  - Windows: Local USB/parallel connection
  - Raspberry Pi: USB connection with CUPS configured
- Optional: Discord Bot Token for Discord integration
- Optional: Home Assistant instance
- Optional: Grocy instance for shopping list integration

## Installation

1. Clone the repository or download the files
2. Install dependencies:

```bash
npm install
```

## Printer Setup

### Option 1: Windows Local Printing

1. Connect your Bixolon SRP350plus via USB
2. Install the printer driver and ensure it appears in Windows Settings → Printers
3. In `server.js`, configure:
   ```javascript
   const PRINTER_NAME = 'BIXOLON SRP-350plus';
   const USE_CUPS = false; // Set to false for Windows
   ```

### Option 2: CUPS on Raspberry Pi (Network Printing)

1. Setup CUPS on Raspberry Pi:
   ```bash
   sudo apt-get update
   sudo apt-get install cups
   sudo usermod -a -G lpadmin pi
   sudo cupsctl --remote-any
   sudo systemctl restart cups
   ```

2. Add your printer:
   - Open browser to `https://your-pi-ip:631`
   - Go to Administration then Add Printer
   - Select your Bixolon SRP-350plus
   - Set as "Local Raw Printer"
   - Note the printer name (e.g., `BIXOLON_SRP-350plus`)

3. Configure thermal-print-node:
   In `server.js`, update these settings:
   ```javascript
   const PRINTER_NAME = 'BIXOLON_SRP-350plus';
   const CUPS_SERVER = '192.168.1.168'; // Your Raspberry Pi IP
   const CUPS_PORT = '631';
   const USE_CUPS = true; // Set to true for CUPS
   ```

4. Install IPP package:
   ```bash
   npm install ipp
   ```

## Discord Bot Setup (Optional)

Messages from a Discord channel will auto-print, including text and images.

1. Create a Discord Bot:
   - Go to https://discord.com/developers/applications
   - Click "New Application" and give it a name
   - Go to "Bot" section and click "Add Bot"
   - Under "Privileged Gateway Intents", enable Message Content Intent
   - Copy the bot token

2. Invite Bot to Your Server:
   - Go to OAuth2 then URL Generator
   - Select scopes: `bot`
   - Select permissions: `Read Messages/View Channels`, `Send Messages`, `Add Reactions`
   - Copy the generated URL and open it in your browser to invite the bot

3. Get Channel ID:
   - Enable Developer Mode in Discord (Settings then Advanced then Developer Mode)
   - Right-click the channel you want to monitor and select "Copy ID"

4. Configure CoolPrinter:
   - Copy `.env.example` to `.env`
   - Add your bot token and channel ID:
   ```env
   DISCORD_TOKEN=your_bot_token_here
   DISCORD_CHANNEL_ID=your_channel_id_here
   ```

### Discord Commands
- `!print <text>` - Print custom text
- `!printhelp` - Show all available print commands
- `!quote` - Print a motivational quote
- `!joke` - Print a random joke
- `!dice 2d6` - Roll dice
- `!crypto bitcoin,ethereum` - Print crypto prices
- `!qr <text>` - Generate and print QR code
- Use `!printhelp` for the full list

All messages and images posted in the monitored channel will automatically print.

## Home Assistant Integration (Optional)

Trigger prints from Home Assistant automations.

### Setup in Home Assistant

Add this to your `configuration.yaml` or create an automation:

```yaml
automation:
  - alias: "Print Temperature Alert"
    trigger:
      - platform: numeric_state
        entity_id: sensor.living_room_temperature
        above: 25
    action:
      - service: rest_command.coolprinter
        data:
          title: "Temperature Alert"
          message: "Living room is {{ states('sensor.living_room_temperature') }}°C!"
          icon: "[TEMP]"

rest_command:
  coolprinter:
    url: "http://YOUR_PC_IP:3000/homeassistant"
    method: POST
    content_type: "application/json"
    payload: '{"title": "{{ title }}", "message": "{{ message }}", "icon": "{{ icon }}"}'
```

Replace `YOUR_PC_IP` with your computer's local IP address (e.g., `192.168.1.100`).

### Example Automations

Print when someone arrives home:
```yaml
automation:
  - alias: "Welcome Home Print"
    trigger:
      - platform: state
        entity_id: person.john
        to: "home"
    action:
      - service: rest_command.coolprinter
        data:
          title: "Welcome Home!"
          message: "John just arrived home"
```

Print doorbell notification:
```yaml
automation:
  - alias: "Doorbell Print"
    trigger:
      - platform: state
        entity_id: binary_sensor.doorbell
        to: "on"
    action:
      - service: rest_command.coolprinter
        data:
          title: "DOORBELL"
          message: "Someone is at the door!"
          icon: "[!!!]"
```

## Grocy Integration (Optional)

Print your shopping lists and inventory directly from Grocy.

1. Get your Grocy API Key:
   - Log into Grocy
   - Go to Manage API keys
   - Create a new key or copy an existing one

2. Configure CoolPrinter:
   Add to your `.env` file:
   ```env
   GROCY_URL=https://your-grocy-instance.com
   GROCY_API_KEY=your_api_key_here
   ```

3. Use the endpoints:
   - `GET /print-grocy` - Print current shopping list
   - `GET /print-stock` - Print current inventory stock levels

## Running the Application

1. Start the server:

```bash
npm start
```

2. Open your browser and go to:
   ```
   http://localhost:3000
   ```

3. Use the web interface or API endpoints to print.

## API Endpoints

### Core Printing
- `GET /` - Web interface for printing
- `GET /endpoints` - View all available endpoints with descriptions
- `POST /print` - Print custom text
  ```json
  { "reminder": "Your text here" }
  ```
- `POST /print-image` - Upload and print an image (multipart/form-data)
- `GET /printers` - List configured printer info (troubleshooting)

### Fun & Useful
- `GET /print-quote` - Random motivational quote
- `GET /print-fortune` - Fortune cookie message
- `GET /print-joke` - Random joke
- `GET /print-time` - Current date and time
- `GET /print-fact` - Random interesting fact
- `GET /print-trivia` - Trivia question with multiple choice answers
- `GET /print-affirmation` - Daily positive affirmation
- `GET /print-compliment` - Random compliment
- `GET /print-word` - Word of the day with definition

### Data & Information
- `GET /print-weather` - Weather forecast for Engesvang, Denmark (customizable)
- `GET /print-crypto?coins=bitcoin,ethereum` - Cryptocurrency prices
- `GET /print-nvidia-stock` - NVIDIA stock chart with 10-day history
- `GET /print-moon` - Current moon phase
- `GET /print-iss` - International Space Station location
- `GET /print-apod` - NASA Astronomy Picture of the Day info

### Interactive
- `GET /print-dice?dice=2d6` - Roll dice (e.g., 2 six-sided dice)
- `GET /print-8ball?q=your question` - Magic 8-ball answer
- `GET /print-coinflip` - Flip a coin
- `GET /print-qr?text=Hello` or `?url=https://...` - Generate QR code

### Shopping & Inventory
- `POST /print-shopping` - Print shopping list
  ```json
  { "items": ["Milk", "Bread", "Eggs"] }
  ```
- `GET /print-grocy` - Print Grocy shopping list (requires API key)
- `GET /print-stock` - Print Grocy inventory stock (requires API key)

### Integrations
- `POST /homeassistant` - Home Assistant webhook
  ```json
  { 
    "title": "Notification",
    "message": "Message text",
    "icon": "[ICON]"
  }
  ```

## Troubleshooting

### Printer Not Found (Windows)
- Verify the printer is connected and powered on
- Check that the printer name in `server.js` matches the name in Windows
- Visit `http://localhost:3000/printers` to see configured printer info

### CUPS Connection Issues (Raspberry Pi)
- Verify CUPS server IP address is correct in `server.js`
- Check CUPS is running: `sudo systemctl status cups`
- Ensure `ipp` package is installed: `npm install ipp`
- Test CUPS web interface: `https://your-pi-ip:631`
- Check printer queue in CUPS for error messages
- Verify the printer is "Idle" and accepting jobs

### Print Not Working
- Ensure the printer driver is properly installed
- Check that paper is loaded and printer is online
- Try printing a test page to verify the printer works
- Check the terminal/console for error messages
- For CUPS: Check printer status at `https://your-pi-ip:631/printers/`

### Image Printing Issues
- Images are automatically resized and dithered for thermal printing
- Supported formats: PNG, JPG, GIF, WebP
- Maximum recommended size: 384px width (thermal printer limitation)
- If image is too large, the printer may error - try a smaller image

### Discord Bot Not Responding
- Verify `DISCORD_TOKEN` and `DISCORD_CHANNEL_ID` are set correctly in `.env`
- Check "Message Content Intent" is enabled in Discord Developer Portal
- Ensure bot has permissions to read and react to messages
- Check console for Discord connection errors

### Port Already in Use
If port 3000 is already in use, change it in `server.js`:
```javascript
const PORT = 3000; // Change to another port like 3001
```

## Environment Variables

Create a `.env` file in the project root:

```env
# Discord Bot (Optional)
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CHANNEL_ID=your_channel_id

# Grocy Integration (Optional)
GROCY_URL=https://your-grocy-instance.com
GROCY_API_KEY=your_api_key
```

## Configuration Options

In `server.js`, you can customize:

```javascript
// Printer configuration
const PRINTER_NAME = 'BIXOLON_SRP-350plus';  // Your printer name
const CUPS_SERVER = '192.168.1.168';          // Raspberry Pi IP
const CUPS_PORT = '631';                       // CUPS port (default 631)
const USE_CUPS = true;                         // true for CUPS, false for Windows

// Server port
const PORT = 3000;                             // Web server port
```

## Project Structure

```
CoolPrinter/
├── server.js          # Express backend server with printer integration
├── package.json       # Project dependencies
├── .env.example       # Environment variables template
├── .env              # Your configuration (create from .env.example)
├── public/
│   └── index.html    # Frontend web interface
└── README.md         # This file
```

## Technologies Used

- **Express** - Web server framework
- **IPP** - Internet Printing Protocol client for CUPS
- **Discord.js** - Discord bot integration
- **Sharp** - Image processing and dithering
- **Axios** - HTTP client for API integrations
- **ESC/POS** - Direct thermal printer commands
- **dotenv** - Environment variable management
- **Multer** - File upload handling

## Example Use Cases

### Home Automation
- Print notifications when someone arrives home
- Print doorbell alerts
- Print temperature warnings
- Print security camera alerts
- Print package delivery notifications

### Discord Server
- Print announcements from your server
- Print memes and images automatically
- Print reminders using bot commands
- Print crypto prices

### Shopping & Kitchen
- Print Grocy shopping lists before going to the store
- Print inventory stock levels
- Print recipe reminders
- Print meal planning notes

### Daily Routines
- Print daily affirmations in the morning
- Print weather before leaving home
- Print your calendar for the day
- Print motivational quotes

### Fun & Entertainment
- Print random jokes
- Print trivia questions for game night
- Print QR codes for WiFi guests
- Print crypto/stock updates
- Print NASA astronomy info

## Security Notes

- Store all sensitive credentials in `.env` file
- `.env` is in `.gitignore` and will not be committed
- The Raspberry Pi IP address (192.168.1.168) is a local network address
- CUPS web interface uses self-signed SSL certificate by default
- For production use, consider adding authentication to API endpoints

## License

ISC

## Support

- For Bixolon printer issues, refer to official Bixolon documentation
- For CUPS setup help, see: https://www.cups.org/doc/overview.html
- For Discord bot issues, see: https://discord.js.org/

## Contributing

Feel free to fork and customize for your needs. Some ideas for enhancement:
- Add authentication for API endpoints
- Support multiple printers
- Add printer queue management
- Create custom templates for different print types
- Add scheduling for automated prints
- Support additional printer brands


