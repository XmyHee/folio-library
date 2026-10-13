const {spawnSync}=require('node:child_process');
const suites=['check.cjs','check-fuzzy.cjs','check-chinese-author.cjs','check-pdf-preview.cjs','check-book-metadata.cjs','check-paper-metadata.cjs','check-pbdl.cjs','check-document-cover.cjs','check-cover-layout.cjs','check-embedding.cjs','check-reidentify-paper.cjs','check-append.cjs','check-review.cjs','check-manual-metadata.cjs','check-cover-workflow.cjs','check-views.cjs','check-export-package.cjs','check-phase-one.cjs','check-phase-three.cjs','check-phase-two.cjs'];
suites.push('check-feature-commands.cjs');
suites.push('check-markdown.cjs');
suites.push('check-stability.cjs');
suites.push('check-task-progress.cjs');
suites.push('check-store.cjs');
for(const suite of suites){console.log('\n'+suite);const result=spawnSync(process.execPath,[suite],{stdio:'inherit'});if(result.status!==0)process.exit(result.status||1)}
