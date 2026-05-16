import e from 'electron'; console.log('default type:', typeof e); import('electron').then(m => console.log('dynamic keys:', Object.keys(m).slice(0,5)));
