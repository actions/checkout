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
  actionYamlPath = 'action.yml',
  readmePath = 'README.md',
  startToken = '<!-- start usage -->',
  endToken = '<!-- end usage -->'
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
    let description = (input.description as string)
      .trimRight()
      .replace(/\r\n/g, '\n') // Convert CR to LF
      .replace(/ +/g, ' ') //    Squash consecutive spaces
      .replace(/ \n/g, '\n') //  Squash space followed by newline
    while (description) {
      // Longer than width? Find a space to break apart
      let segment: string = description
      if (description.length > width) {
        segment = description.substr(0, width + 1)
        while (!segment.endsWith(' ') && !segment.endsWith('\n') && segment) {
          segment = segment.substr(0, segment.length - 1)
        }

        // Trimmed too much?
        if (segment.length < width * 0.67) {
          segment = description
        }
      } else {
        segment = description
      }

      // Check for newline
      const newlineIndex = segment.indexOf('\n')
      if (newlineIndex >= 0) {
        segment = segment.substr(0, newlineIndex + 1)
      }

      // Append segment
      newReadme.push(`    # ${segment}`.trimRight())

      // Remaining
      description = description.substr(segment.length)
    }

    if (input.default !== undefined) {
      // Append blank line if description had paragraphs
      if ((input.description as string).trimRight().match(/\n[ ]*\r?\n/)) {
        newReadme.push(`    #`)
      }

      // Default
      newReadme.push(`    # Default: ${input.default}`)
    }

    // Input name
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
  'actions/checkout@v2',
  path.join(__dirname, '..', '..', 'action.yml'),
  path.join(__dirname, '..', '..', 'README.md')
)
