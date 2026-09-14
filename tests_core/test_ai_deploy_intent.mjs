const deploymentIntent=/^(?:please\s+)?(?:deploy|rilis|publish)(?:\s+(?:ke\s+)?production)?(?:\s+now)?[.!\s]*$/i;
const broadProduction=/(?!x)x/;
const cases=[
  ['deploy',true],['deploy ke production',true],['rilis production',true],['publish to production',false],['bagaimana deploy production?',false],['jelaskan proses deploy ke production',false],['deploy nanti setelah test',false]
];
for(const [text,want] of cases){const got=deploymentIntent.test(text)||broadProduction.test(text);if(got!==want)throw new Error(`FAILED intent: ${text} => ${got}`)}
console.log('PASS: deployment intent requires an actionable deploy/release/publish command; informational questions do not trigger approval requests.');
