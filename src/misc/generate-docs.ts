import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as yaml from 'js-yaml'

//
// SUMMARY
//
// This script rebuilds the usage section in the README.md to be consistent with the action.yml

function updateUsage(
  actionReference: string,
  actionYamlPath: string = 'action.yml',
  readmePath: string = 'README.md',
  startToken: string = '<!-- start usage -->',
  endToken: string = '<!-- end usage -->'
): void {
  if (!actionReference) {
    throw new Error('Parameter actionReference must not be empty')
  }

  // Load the action.yml
  const actionYaml = yaml.safeLoad(fs.readFileSync(actionYamlPath).toString())

  // Load the README
  const originalReadme = fs.readFileSync(readmePath).toString()

  // Find the start token
  const startTokenIndex = originalReadme.indexOf(startToken)
  if (startTokenIndex < 0) {
    throw new Error(`Start token '${startToken}' not found`)
  }

  // Find the end token
  const endTokenIndex = originalReadme.indexOf(endToken)
  if (endTokenIndex < 0) {
    throw new Error(`End token '${endToken}' not found`)
  } else if (endTokenIndex < startTokenIndex) {
    throw new Error('Start token must appear before end token')
  }

  // Build the new README
  const newReadme: string[] = []

  // Append the beginning
  newReadme.push(originalReadme.substr(0, startTokenIndex + startToken.length))

  // Build the new usage section
  newReadme.push('```yaml', `- uses: ${actionReference}`, '  with:')
  const inputs = actionYaml.inputs
  let firstInput = true
  for (const key of Object.keys(inputs)) {
    const input = inputs[key]

    // Line break between inputs
    if (!firstInput) {
      newReadme.push('')
    }

    // Constrain the width of the description
    const width = 80
    let description = input.description as string
    while (description) {
      // Longer than width? Find a space to break apart
      let segment: string = description
      if (description.length > width) {
        segment = description.substr(0, width + 1)
        while (!segment.endsWith(' ')) {
          segment = segment.substr(0, segment.length - 1)
        }
      } else {
        segment = description
      }

      description = description.substr(segment.length) // Remaining
      segment = segment.trimRight() // Trim the trailing space
      newReadme.push(`    # ${segment}`)
    }

    // Input and default
    if (input.default !== undefined) {
      newReadme.push(`    # Default: ${input.default}`)
    }
    newReadme.push(`    ${key}: ''`)

    firstInput = false
  }

  newReadme.push('```')

  // Append the end
  newReadme.push(originalReadme.substr(endTokenIndex))

  // Write the new README
  fs.writeFileSync(readmePath, newReadme.join(os.EOL))
}

updateUsage(
  'actions/checkout@preview',
  path.join(__dirname, '..', '..', 'action.yml'),
  path.join(__dirname, '..', '..', 'README.md')
)
