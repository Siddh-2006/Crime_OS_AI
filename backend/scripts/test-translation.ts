import { translationService } from '../src/modules/translation/translation.service';

async function run() {
  const hardText = "During the preliminary investigation, it was established that the accused engaged in a sophisticated modus operandi involving multiple shell companies to launder the illicit proceeds of the cyber fraud. The circumstantial evidence, including the encrypted communications and offshore bank transactions, firmly corroborates the complainant's allegations under Section 318(4) and Section 319(2) of the Bharatiya Nyaya Sanhita, 2023.";

  console.log("--- GUJARATI FULL PARAGRAPH RETRY (Gemma 4 Local) ---");
  
  const result = await translationService.translateBatch({
    texts: [hardText],
    sourceLanguage: 'en',
    targetLanguage: 'gu'
  });
  console.log(`Original: ${hardText}`);
  console.log(`\nGujarati Translation:\n${result[0].translatedText}`);
}

run().then(() => process.exit(0)).catch(console.error);
