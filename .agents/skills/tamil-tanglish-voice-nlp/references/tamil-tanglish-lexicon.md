# Tamil Script & Romanized Tanglish Slang Lexicon for Form Extraction

## 1. Field Label Aliases (English $\leftrightarrow$ Tanglish $\leftrightarrow$ Tamil Script)

| Canonical Field | Tanglish Slang Triggers | Tamil Script Triggers |
| :--- | :--- | :--- |
| **Full Name** | `en peru`, `ennoda peru`, `en peyar`, `peyar`, `peru` | `என் பெயர்`, `என் பேரு`, `என்னோட பேரு`, `பெயர்` |
| **Email** | `mail id`, `en mail id`, `email id`, `minnanjal` | `ஈமெயில்`, `மெயில் ஐடி`, `மின்னஞ்சல்` |
| **Phone** | `en phone number`, `mobile number`, `en number`, `kaipesi` | `போன் நம்பர்`, `மொபைல் நம்பர்`, `கைபேசி எண்`, `தொலைபேசி எண்` |
| **Age** | `vayasu`, `en vayasu`, `ennoda vayasu`, `vayadhu` | `வயசு`, `என் வயசு`, `வயது` |
| **Date of Birth** | `porandha thedhi`, `pirandha thedhi`, `pirantha thethi`, `porandha naal`, `dob` | `பிறந்த தேதி`, `பொறந்த தேதி`, `பிறந்த நாள்` |
| **Experience** | `anubavam`, `varusham experience`, `varusham anubavam` | `அனுபவம்`, `வருஷம் அனுபவம்`, `ஆண்டுகள் அனுபவம்` |
| **Department** | `department`, `dept`, `thurai`, `entha department` | `துறை`, `டிபார்ட்மெண்ட்`, `பிரிவு` |
| **Skills** | `skills`, `thiramaigal`, `therinja skills`, `theriyum` | `திறன்கள்`, `திறமைகள்`, `ஸ்கில்ஸ்` |
| **Location / City** | `ooru`, `en ooru`, `entha ooru`, `mugavari`, `enga irukinga` | `ஊர்`, `ஊரு`, `முகவரி`, `இடம்`, `நகரம்` |
| **Salary / Income** | `sambalam`, `ethana latcham`, `package`, `varumanam` | `சம்பளம்`, `வருமானம்`, `ஊதியம்` |

## 2. Spoken Tamil Numerals (Tanglish & Tamil Script)
- **1–10**: `onnu` (`ஒன்று`/`ஒண்ணு`=1), `rendu` (`இரண்டு`/`ரெண்டு`=2), `moonu` (`மூன்று`/`மூணு`=3), `naalu` (`நான்கு`/`நாலு`=4), `anju` (`ஐந்து`/`அஞ்சு`=5), `aaru` (`ஆறு`=6), `ezhu` (`ஏழு`=7), `ettu` (`எட்டு`=8), `onbadhu` (`ஒன்பது`=9), `pathu` (`பத்து`=10)
- **11–19**: `pathinonnu` (11), `pannirendu` (12), `pathimoonu` (13), `pathinaalu` (14), `pathinanju` (15), `pathinaaru` (16), `pathinezhu` (17), `pathinettu` (18), `pathonbadhu` (19)
- **Tens & Multipliers**: `iruvathi`/`iruvadhu` (20), `muppathi`/`muppadhu` (30), `naapathi`/`naapadhu` (40), `aimbathi`/`aimbadhu` (50), `aruvathi`/`aruvadhu` (60), `ezhuvathi`/`ezhuvadhu` (70), `enbathi`/`enbadhu` (80), `thonnooru` (90), `nooru` (100), `aayiram` (1000), `latcham` (100000)

## 3. Self-Correction & Repair Markers
- **Retraction Cues**: `illa illa`, `illa wait`, `sorry`, `no wait`, `மாத்தி சொல்லிட்டேன்`, `இல்ல இல்ல`, `அல்ல`
- **Rule**: When a value contains `<wrong_val> (illa illa|இல்ல இல்ல|no wait|sorry) <corrected_val>`, extract `<corrected_val>`.
