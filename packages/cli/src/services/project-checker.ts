import * as fs from 'fs-extra'
import * as path from 'path'
//import { Logger } from '@boostercloud/framework-types'
import { logger } from '../services/logger'

function checkIndexFileIsBooster(indexFilePath: string): void {
  const contents = fs.readFileSync(indexFilePath)
  if (!contents.includes('Booster.start(')) {
    throw new Error(
      'The main application file does not start a Booster application. Verify you are in the right project'
    )
  }
}

export async function checkCurrentDirIsABoosterProject(): Promise<void> {
  return checkItIsABoosterProject(process.cwd())
}

export async function checkItIsABoosterProject(projectPath: string): Promise<void> {
  const projectAbsolutePath = path.resolve(projectPath)
  try {
    const tsConfigJsonContents = require(path.join(projectAbsolutePath, 'tsconfig.json'))
    const indexFilePath = path.normalize(
      path.join(projectAbsolutePath, tsConfigJsonContents.compilerOptions.rootDir, 'index.ts')
    )
    checkIndexFileIsBooster(indexFilePath)
  } catch (e) {
    throw new Error(
      `There was an error when recognizing the application. Make sure you are in the root path of a Booster project:\n${e.message}`
    )
  }
}

export async function checkCurrentDirBoosterVersion(userAgent: string): Promise<void> {
  return checkBoosterVersion(userAgent, process.cwd())
}

export async function checkBoosterVersion(userAgent: string, projectPath: string): Promise<void> {
  const projectVersion = await getBoosterVersion(projectPath)
  const cliVersion = userAgent.split(' ')[0].split('/')[2]
  await compareVersionsAndDisplayMessages(cliVersion, projectVersion)
}

async function getBoosterVersion(projectPath: string): Promise<string> {
  const projectAbsolutePath = path.resolve(projectPath)
  try {
    const packageJsonContents = require(path.join(projectAbsolutePath, 'package.json'))
    const version = packageJsonContents.dependencies['@boostercloud/framework-core']
    return version.replace('^','')
  } catch (e) {
    throw new Error(
      `There was an error when recognizing the application. Make sure you are in the root path of a Booster project:\n${e.message}`
    )
  }
}

async function compareVersionsAndDisplayMessages(cliVersion: string, projectVersion: string): Promise<void> {
  if (cliVersion === projectVersion)  { return }
  const cliVersionParts = cliVersion.split('.').map((v) => parseInt(v,10))
  const projectVersionParts = projectVersion.split('.').map((v) => parseInt(v,10))
  if (cliVersionParts.length !== projectVersionParts.length) {
    throw new Error(`Versions must have the same length. CLI version: ${cliVersion}. Project Booster version: ${projectVersion}`)
  }
  if (projectVersionParts.length !== 3) {
    throw new Error(`Versions must follow semantic convention X.Y.Z | CLI version: ${cliVersion}. Project Booster version: ${projectVersion}`)
  }
  if (cliVersionParts[0] === projectVersionParts[0]) {
    if (cliVersionParts[1] === projectVersionParts[1]) {
      if (cliVersionParts[2] !== projectVersionParts[2]) {
        logger.info(`WARNING: Project Booster version differs in the 'fix' section from CLI version. CLI version: ${cliVersion}. Project Booster version: ${projectVersion}`)
      }
    }
  }  
}