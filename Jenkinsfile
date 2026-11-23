pipeline {
    agent { label 'agent1' }

    options {
        // A scan that hangs on a network fetch would otherwise keep running
        // until someone noticed, and hold up the required check on every
        // open pull request behind it.
        timeout(time: 20, unit: 'MINUTES')
        // A new push to a branch makes the build of the previous push
        // pointless; stop it rather than queue behind it.
        disableConcurrentBuilds(abortPrevious: true)
        buildDiscarder(logRotator(numToKeepStr: '30', artifactNumToKeepStr: '5'))
    }

    stages {
        // Every commit a pull request adds must carry GitHub no-reply
        // addresses. Git fills in the local user and machine name when no
        // address is configured, and a commit published that way cannot be
        // taken back. This cannot stop the push, but it fails the required
        // check while the commit is still only on a branch. The offending
        // address is deliberately not printed.
        stage('Commit identity') {
            when { changeRequest() }
            steps {
                sh '''
                    git fetch --no-tags origin "+refs/heads/${CHANGE_TARGET}:refs/remotes/origin/${CHANGE_TARGET}"
                    git log --no-merges --format='%h %ae %ce' "origin/${CHANGE_TARGET}..HEAD" | awk '
                        {
                            ok = 1
                            for (i = 2; i <= 3; i++) {
                                if ($i !~ /@users[.]noreply[.]github[.]com$/ && $i != "noreply@github.com") ok = 0
                            }
                            if (!ok) {
                                print "commit " $1 ": author or committer is not a GitHub no-reply address"
                                bad = 1
                            }
                        }
                        END { exit bad }
                    '
                '''
            }
        }
        stage('Secrets scan') {
            steps {
                sh 'gitleaks dir . --redact -v'
            }
        }
        // The working-tree scan above sees only the files as they are now. A
        // secret added in one commit of a pull request and removed in a later
        // one is in none of them, and squash-merging keeps those commits out
        // of main, so a scan of main's history never sees it either, while
        // the commits stay public through the pull request. This used to run
        // on main only; it adds a few seconds, so it runs on every build.
        stage('Secrets scan (history)') {
            steps {
                sh 'gitleaks git . --redact'
            }
        }
        stage('SAST') {
            steps {
                sh 'semgrep scan --config p/default --config p/typescript --config p/react --config p/owasp-top-ten --error --metrics=off .'
            }
        }
        stage('Workflow audit') {
            steps {
                sh 'zizmor .github/workflows/'
            }
        }
        stage('Dockerfile lint') {
            steps {
                sh 'hadolint ci/agent/Dockerfile'
            }
        }
        stage('Supply chain') {
            steps {
                sh 'osv-scanner scan source -L package-lock.json'
            }
        }
        // Main only: the SBOM describes the state of main as a whole, not an
        // individual change.
        stage('SBOM') {
            when { branch 'main' }
            steps {
                sh 'syft dir:. -o cyclonedx-json > sbom.json'
                archiveArtifacts artifacts: 'sbom.json'
            }
        }
    }

    post {
        // Start every build from a clean checkout: nothing a previous build
        // left behind, on any branch, can change what this one scans.
        cleanup {
            deleteDir()
        }
    }
}
