import * as path from 'path'
import { 
    checkItIsABoosterProject, 
    checkCurrentDirIsABoosterProject,
    checkCurrentDirBoosterVersion
} from '../../src/services/project-checker'
import * as projectUpdater from '../../src/services/project-updater'
import { logger } from '../../src/services/logger'
import { restore, replace, fake, stub } from 'sinon'
import { expect } from '../expect'
import inquirer = require('inquirer')

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
        
        beforeEach(() => {
            replace(projectUpdater,'updatePackageJsonDependencyVersions', fake.resolves({}))
            replace(logger,'info', fake.resolves({}))
        })

        describe('inside a Booster project', () => {
            //project version in mocked package.json is 1.11.2
            beforeEach(() => {
                replace(process,'cwd', fake.returns(path.join(process.cwd(),'test', 'fixtures', 'mock_project')))
            })

            it('versions match', async () => {
                const userAgent = '@boostercloud/cli/1.11.2 darwin-x64 node-v12.10.0'
                let exceptionThrown = false
                await checkCurrentDirBoosterVersion(userAgent).catch(() => exceptionThrown = true)
                expect(exceptionThrown).to.be.equal(false)
                expect(logger.info).have.not.been.called
                expect(projectUpdater.updatePackageJsonDependencyVersions).have.not.been.called
            })
    
            it('versions differs in fix number with cli version greater than project version', async () => {
                const userAgent = '@boostercloud/cli/1.11.3 darwin-x64 node-v12.10.0'
                let exceptionThrown = false
                await checkCurrentDirBoosterVersion(userAgent).catch(() => exceptionThrown = true)
                expect(exceptionThrown).to.be.equal(false)
                expect(logger.info).have.been.calledWithMatch(/WARNING: Project Booster version differs in the 'fix' section/)
                expect(projectUpdater.updatePackageJsonDependencyVersions).have.not.been.called
            })
    
            it('versions differs in fix number with cli version lower than project version', async () => {
                const userAgent = '@boostercloud/cli/1.11.0 darwin-x64 node-v12.10.0'
                let exceptionThrown = false
                await checkCurrentDirBoosterVersion(userAgent).catch(() => exceptionThrown = true)
                expect(exceptionThrown).to.be.equal(false)
                expect(logger.info).have.been.calledWithMatch(/WARNING: Project Booster version differs in the 'fix' section/)
                expect(projectUpdater.updatePackageJsonDependencyVersions).have.not.been.called
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
                expect(projectUpdater.updatePackageJsonDependencyVersions).have.not.been.called
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
                expect(projectUpdater.updatePackageJsonDependencyVersions).have.not.been.called
            })
    
            describe('cli version higher than project version in <feature> section', () => {
                it('user upgrades package.json dependencies', async () => {
                    const promptStub = stub(inquirer,'prompt')
                    promptStub.resolves({value: 'Yes'})
                    const userAgent = '@boostercloud/cli/1.12.2 darwin-x64 node-v12.10.0'
                    let exceptionThrown = false                
                    await checkCurrentDirBoosterVersion(userAgent).catch(() => exceptionThrown = true)
                    expect(exceptionThrown).to.be.equal(false)
                    expect(logger.info).have.been.calledWithMatch(/package.json Booster dependencies have been updated to version/)
                    expect(projectUpdater.updatePackageJsonDependencyVersions).have.been.calledWith('1.12.2')
                })
        
                it('user rejects upgrading package.json dependencies', async () => {
                    const promptStub = stub(inquirer,'prompt')
                    promptStub.resolves({value: 'No'})
                    const userAgent = '@boostercloud/cli/1.12.2 darwin-x64 node-v12.10.0'
                    let exceptionThrown = false
                    let exceptionMessage = ''
                    await checkCurrentDirBoosterVersion(userAgent).catch((e) => {
                        exceptionThrown = true
                        exceptionMessage = e.message
                    })
                    expect(exceptionThrown).to.be.equal(true)
                    expect(exceptionMessage).to.contain('Please upgrade your project dependencies')
                    expect(logger.info).have.not.been.called
                    expect(projectUpdater.updatePackageJsonDependencyVersions).have.not.been.called
                })
            })
    
            it('cli version higher than project version in <breaking> section', async () => {
                const userAgent = '@boostercloud/cli/2.11.2 darwin-x64 node-v12.10.0'
                let exceptionThrown = false
                let exceptionMessage = ''
                await checkCurrentDirBoosterVersion(userAgent).catch((e) => {
                    exceptionThrown = true
                    exceptionMessage = e.message
                })
                expect(exceptionThrown).to.be.equal(true)
                expect(exceptionMessage).to.contain('Please upgrade your project dependencies or install the same CLI version with')
                expect(logger.info).have.not.been.called
                expect(projectUpdater.updatePackageJsonDependencyVersions).have.not.been.called
            })
    
            it('cli version wrong length shorter', async () => {
                const userAgent = '@boostercloud/cli/1.11 darwin-x64 node-v12.10.0'
                let exceptionThrown = false
                let exceptionMessage = ''
                await checkCurrentDirBoosterVersion(userAgent).catch((e) => {
                    exceptionThrown = true
                    exceptionMessage = e.message
                })
                expect(exceptionThrown).to.be.equal(true)
                expect(exceptionMessage).to.contain('Versions must have the same length')
                expect(logger.info).have.not.been.called
                expect(projectUpdater.updatePackageJsonDependencyVersions).have.not.been.called
            })
    
            it('cli version wrong length longer', async () => {
                const userAgent = '@boostercloud/cli/1.11.2.1 darwin-x64 node-v12.10.0'
                let exceptionThrown = false
                let exceptionMessage = ''
                await checkCurrentDirBoosterVersion(userAgent).catch((e) => {
                    exceptionThrown = true
                    exceptionMessage = e.message
                })
                expect(exceptionThrown).to.be.equal(true)
                expect(exceptionMessage).to.contain('Versions must have the same length')
                expect(logger.info).have.not.been.called
                expect(projectUpdater.updatePackageJsonDependencyVersions).have.not.been.called
            })

        })
        

        it('outside a Booster project', async () => {
            replace(process,'cwd', fake.returns(path.join(process.cwd(),'test', 'fixtures')))
            const userAgent = '@boostercloud/cli/1.11.2 darwin-x64 node-v12.10.0'
            let exceptionThrown = false
            let exceptionMessage = ''
            await checkCurrentDirBoosterVersion(userAgent).catch((e) => {
                exceptionThrown = true
                exceptionMessage = e.message
            })
            expect(exceptionThrown).to.be.equal(true)
            expect(exceptionMessage).to.contain('There was an error when recognizing the application')
            expect(logger.info).have.not.been.called
            expect(projectUpdater.updatePackageJsonDependencyVersions).have.not.been.called
        })
    })
})