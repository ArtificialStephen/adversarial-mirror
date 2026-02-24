import { Command } from 'commander'
import { runChat } from './commands/chat.js'
import { runMirror } from './commands/mirror.js'
import { runConfig } from './commands/config.js'
import {
  runBrainsAdd,
  runBrainsList,
  runBrainsTest
} from './commands/brains.js'

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
config.action(runConfig)
config.command('show').description('Show current config').action(runConfig)

const brains = program.command('brains').description('Brain management commands')
brains.action(runBrainsList)
brains.command('list').description('List configured brains').action(runBrainsList)
brains.command('test <id>').description('Test a brain').action(runBrainsTest)
brains.command('add').description('Add a new brain').action(runBrainsAdd)

program.parse()
