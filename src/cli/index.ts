import { Command } from 'commander'
import { runChat } from './commands/chat.js'
import { runMirror } from './commands/mirror.js'
import { runConfig } from './commands/config.js'
import { runBrains } from './commands/brains.js'

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

program
  .command('config')
  .description('Config commands')
  .action(runConfig)

program
  .command('brains')
  .description('Brain management commands')
  .action(runBrains)

program.parse()
