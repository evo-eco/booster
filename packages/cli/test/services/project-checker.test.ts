import * as path from 'path'
import { 
    checkItIsABoosterProject, 
    checkCurrentDirIsABoosterProject,
    checkCurrentDirBoosterVersion
} from '../../src/services/project-checker'
import { logger } from '../../src/services/logger'
import { restore, replace, fake } from 'sinon'
import { expect } from '../expect'

describe('project checker', (): void => {

    afterEach(() => {
        restore()
    })

    describe('checkCurrentDirIsABoosterProject', () => {
        it('is a Booster project', async () => {
            replace(process,'cwd', fake.returns(path.join(process.cwd(),'test', 'fixtures', 'mock_project')))
            let exceptionThrown = false
            await checkCurrentDirIsABoosterProject().catch(() => exceptionThrown = true)
            expect(exceptionThrown).to.be.equal(false)
        })
    
        it('is a Booster project with bad index.ts', async () => {
            replace(process,'cwd', fake.returns(path.join(process.cwd(),'test', 'fixtures', 'mock_project_bad_index')))
            let exceptionThrown = false
            await checkCurrentDirIsABoosterProject().catch(() => exceptionThrown = true)
            expect(exceptionThrown).to.be.equal(true)
        })
    
        it('is not a Booster project', async () => {
            replace(process,'cwd', fake.returns(path.join(process.cwd(),'test', 'fixtures')))
            let exceptionThrown = false
            await checkCurrentDirIsABoosterProject().catch(() => exceptionThrown = true)
            expect(exceptionThrown).to.be.equal(true)
        })
    })

    describe('checkItIsABoosterProject', (): void => {
        it('is a Booster project', async () => {
            const projectPath = path.join(process.cwd(),'test', 'fixtures', 'mock_project')
            let exceptionThrown = false
            await checkItIsABoosterProject(projectPath).catch(() => exceptionThrown = true)
            expect(exceptionThrown).to.be.equal(false)
        })
    
        it('is a Booster project with bad index.ts', async () => {
            const projectPath = path.join(process.cwd(),'test', 'fixtures', 'mock_project_bad_index')
            let exceptionThrown = false
            await checkItIsABoosterProject(projectPath).catch(() => exceptionThrown = true)
            expect(exceptionThrown).to.be.equal(true)
        })
    
        it('is not a Booster project', async () => {
            const projectPath = path.join(process.cwd(),'test', 'fixtures')
            let exceptionThrown = false
            await checkItIsABoosterProject(projectPath).catch(() => exceptionThrown = true)
            expect(exceptionThrown).to.be.equal(true)
        })
    })

    describe('checkCurrentDirBoosterVersion', (): void => {
        //project version in mocked package.json is 1.11.2
        beforeEach(() => {
            replace(process,'cwd', fake.returns(path.join(process.cwd(),'test', 'fixtures', 'mock_project')))
            replace(logger,'info', fake.resolves({}))
        })

        it('versions match', async () => {
            const userAgent = '@boostercloud/cli/1.11.2 darwin-x64 node-v12.10.0'
            let exceptionThrown = false
            await checkCurrentDirBoosterVersion(userAgent).catch(() => exceptionThrown = true)
            expect(exceptionThrown).to.be.equal(false)
            expect(logger.info).have.not.been.called
        })

        it('versions differs in fix number with cli version greater than project version', async () => {
            const userAgent = '@boostercloud/cli/1.11.3 darwin-x64 node-v12.10.0'
            let exceptionThrown = false
            await checkCurrentDirBoosterVersion(userAgent).catch(() => exceptionThrown = true)
            expect(exceptionThrown).to.be.equal(false)
            expect(logger.info).have.been.calledWithMatch(/WARNING: Project Booster version differs in the 'fix' section/)
        })

        it('versions differs in fix number with cli version less than project version', async () => {
            const userAgent = '@boostercloud/cli/1.11.0 darwin-x64 node-v12.10.0'
            let exceptionThrown = false
            await checkCurrentDirBoosterVersion(userAgent).catch(() => exceptionThrown = true)
            expect(exceptionThrown).to.be.equal(false)
            expect(logger.info).have.been.calledWithMatch(/WARNING: Project Booster version differs in the 'fix' section/)
        })

        it('cli lower than project version in <feature> section', async () => {
            const userAgent = '@boostercloud/cli/1.10.2 darwin-x64 node-v12.10.0'
            let exceptionThrown = false
            let exceptionMessage = ''
            await checkCurrentDirBoosterVersion(userAgent).catch((e) => {
                exceptionThrown = true
                exceptionMessage = e.message
            })
            expect(exceptionThrown).to.be.equal(true)
            expect(exceptionMessage).to.contain('Please upgrade your @boostercloud/cli to the same version with npm')
            expect(logger.info).have.not.been.called
        })

        it('cli lower than project version in <breaking> section', async () => {
            const userAgent = '@boostercloud/cli/0.11.2 darwin-x64 node-v12.10.0'
            let exceptionThrown = false
            let exceptionMessage = ''
            await checkCurrentDirBoosterVersion(userAgent).catch((e) => {
                exceptionThrown = true
                exceptionMessage = e.message
            })
            expect(exceptionThrown).to.be.equal(true)
            expect(exceptionMessage).to.contain('Please upgrade your @boostercloud/cli to the same version with npm')
            expect(logger.info).have.not.been.called
        })
    })
})