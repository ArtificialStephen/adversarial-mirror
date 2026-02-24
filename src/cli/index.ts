import { Command } from 'commander'
import { runChat } from './commands/chat.js'
import { runMirror } from './commands/mirror.js'
import {
  runConfigInit,
  runConfigSet,
  runConfigShow
} from './commands/config.js'
import {
  runBrainsAdd,
  runBrainsList,
  runBrainsTest
} from './commands/brains.js'
import {
  runHistoryExport,
  runHistoryList,
  runHistoryShow
} from './commands/history.js'

const program = new Command()

program
  .name('mirror')
  .description('Adversarial Mirror CLI')
  .version('0.1.0')
  .option('--intensity <level>', 'mild|moderate|aggressive')
  .option('--original <brainId>', 'override original brain')
  .option('--challenger <brainId>', 'override challenger brain')
  .option('--no-mirror', 'disable mirroring')
  .option('--no-classify', 'disable intent classification')
  .option('--debug', 'enable debug logging')

program
  .command('chat')
  .description('Interactive session')
  .action(runChat)

program
  .command('mirror <question>')
  .description('One-shot query')
  .action(runMirror)

const config = program.command('config').description('Config commands')
config.action(runConfigShow)
config.command('show').description('Show current config').action(runConfigShow)
config.command('init').description('Interactive setup wizard').action(runConfigInit)
config
  .command('set <key> <value>')
  .description('Set config value by key path')
  .action(runConfigSet)

const brains = program.command('brains').description('Brain management commands')
brains.action(runBrainsList)
brains.command('list').description('List configured brains').action(runBrainsList)
brains.command('test <id>').description('Test a brain').action(runBrainsTest)
brains.command('add').description('Add a new brain').action(runBrainsAdd)

const history = program.command('history').description('History commands')
history.action(runHistoryList)
history.command('list').description('List history').action(runHistoryList)
history.command('show <id>').description('Show history entry').action(runHistoryShow)
history
  .command('export <id> <file>')
  .description('Export history entry to a file')
  .action(runHistoryExport)

// Default to 'chat' when no subcommand is given.
// Appending at the end (after any flags) lets Commander parse global flags at the
// program level before routing to the chat subcommand. This means:
//   mirror                   → mirror chat
//   mirror --intensity aggressive  → mirror --intensity aggressive chat  (global flags preserved)
//   mirror --help            → shows program help  (not intercepted)
//   mirror --version         → shows version       (not intercepted)
const rawArgs = process.argv.slice(2)
const knownSubcommands = new Set(['chat', 'mirror', 'config', 'brains', 'history'])
const hasVersionOrHelp = rawArgs.some(a => ['-V', '--version', '-h', '--help'].includes(a))
const hasSubcommand = rawArgs.some(a => knownSubcommands.has(a))

if (!hasVersionOrHelp && !hasSubcommand) {
  process.argv.push('chat')
}

program.parse()
