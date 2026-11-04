# Voix bambara du jeu — mode d'emploi

Les clients parlent bambara avec de **vraies voix générées à l'avance** (modèle MALIBA-AI/bambara-tts). Le modèle est trop lourd pour
tourner dans le jeu : on fabrique les fichiers audio **une fois sur ton ordinateur**, puis le jeu les joue comme de simples fichiers `.mp3`.

## 1. Comment ça marche (en 4 lignes)

1. Tu écris les phrases dans un fichier tableur : `repliques.csv` (ou `repliques_jeu.csv`).
2. Tu lances `generer_voix.py` : il fabrique un fichier audio par phrase dans `data/voix/`, plus une liste `data/voix/index.json`.
3. Au jeu, quand une phrase bambara s'affiche, le jeu cherche sa voix dans cette liste (par le **texte exact**) et la joue.
4. S'il n'y a pas de voix pour une phrase, le jeu garde l'ancienne lecture phonétique : rien ne casse.

## 2. Arborescence (où est quoi)

```
bamako_game/
├─ tools/voix/                      ← TON ATELIER (ne part pas en ligne)
│   ├─ repliques.csv                  tes phrases : id, personnage, locuteur, texte_bambara, traduction_francais
│   ├─ repliques_jeu.csv              les 64 phrases bambara déjà dans le jeu (fabriqué automatiquement)
│   ├─ generer_voix.py                le script qui fabrique les fichiers audio
│   ├─ exporter_repliques_jeu.mjs     remet repliques_jeu.csv à jour d'après le jeu
│   └─ LISEZMOI.md                    ce fichier
├─ data/voix/                       ← LE RÉSULTAT (part en ligne avec le jeu)
│   ├─ client_001.mp3 …               un fichier audio par phrase, nommé d'après son id
│   └─ index.json                     la liste que le jeu lit (id, texte bambara, français, fichier)
├─ js/voixbm.js                     ← le lecteur de voix dans le jeu : une voix à la fois, sous-titres, volume
└─ js/missions/bambara.js           ← les traductions (texte) + prononciation de secours
```

Colonnes de `repliques.csv` :

| Colonne | Sens | Exemple |
|---|---|---|
| `id` | nom du fichier audio (minuscules, chiffres, `_`) | `client_001` |
| `personnage` | qui parle (pour t'y retrouver) | `Client (taxi)` |
| `locuteur` | la voix : Bourama, Adama, Moussa, Modibo, Seydou, Amadou, Bakary, Ngolo, Ibrahima ou Amara | `Bourama` |
| `texte_bambara` | ce qui est dit, en orthographe standard (ɛ ɔ ɲ ŋ) | `I ni sɔgɔma.` |
| `traduction_francais` | sous-titre français | `Bonjour.` |

⚠ **Pour qu'une voix soit jouée dans le jeu, `texte_bambara` doit être identique, lettre pour lettre, au texte affiché par le jeu**
(voir `js/missions/bambara.js`). C'est pourquoi `repliques_jeu.csv` existe : il part directement des textes du jeu.
Les phrases qui contiennent un nom, un lieu ou un prix (« Ka taa *Badalabugu*… ») ne peuvent pas être pré-enregistrées : elles gardent la lecture phonétique.

Voix : la documentation ne donne pas le genre des 10 locuteurs. Écoute-les avec les exemples de `repliques.csv`, puis choisis dans la colonne `locuteur`.

## 3. Installation (une seule fois)

Ton ordinateur : Windows, carte NVIDIA RTX 3060 (6 Go) — c'est suffisant. Ton Python (3.14) est trop récent pour les bibliothèques d'IA : on crée un environnement séparé en Python 3.11 avec `uv` (déjà installé).

Dans un terminal, depuis le dossier `bamako_game` :

```bat
uv venv --python 3.11 .venv-voix
.venv-voix\Scripts\activate
uv pip install maliba-ai==1.1.1b0
uv pip install git+https://github.com/MALIBA-AI/bambara-tts.git
uv pip install soundfile numpy
```

Vérifie que la carte graphique est utilisée (sinon la génération est très lente) :

```bat
python -c "import torch; print(torch.cuda.is_available())"
```

Si ça affiche `False`, réinstalle torch avec CUDA : `uv pip install torch --index-url https://download.pytorch.org/whl/cu121`.

> Ces commandes viennent de la documentation du modèle (github.com/sudoping01/bambara-tts). Je n'ai **pas pu les exécuter** ici : si une erreur d'installation apparaît, envoie-moi le message.

**Accès Hugging Face.** La documentation ne dit pas que le modèle est protégé, donc normalement rien à faire. Si le script affiche une erreur « 401 », « 403 » ou « gated » :
1. crée un compte sur huggingface.co ;
2. ouvre la page du modèle **MALIBA-AI/bambara-tts** et clique sur « Agree / Accept » pour accepter les conditions ;
3. dans le terminal : `hf auth login`, puis colle ton jeton (huggingface.co → Settings → Access Tokens, droits « Read »).

La première génération télécharge le modèle (environ 1 Go).

## 4. Utilisation

```bat
.venv-voix\Scripts\activate
python tools\voix\generer_voix.py                      :: génère repliques.csv -> data\voix\
python tools\voix\generer_voix.py --csv tools\voix\repliques_jeu.csv   :: les 64 phrases du jeu
python tools\voix\generer_voix.py --dry-run            :: montre ce qui serait fait, sans rien générer
python tools\voix\generer_voix.py --only client_001    :: refait seulement cette voix
python tools\voix\generer_voix.py --format ogg         :: .ogg au lieu de .mp3
```

- **Une voix qui sonne mal ?** Supprime son fichier dans `data/voix/` (ou utilise `--only son_id`), puis relance : seules les voix manquantes sont refaites. Tu peux aussi changer le `locuteur` dans le CSV avant de refaire.
- **Les erreurs** s'affichent en clair avec le numéro de ligne du CSV ; le script vérifie tout le fichier avant de commencer.
- **Formats.** Par défaut `.mp3` : il se lit partout, y compris sur **iPhone/Safari**. Le `.ogg` est plus léger mais **n'est pas lu par Safari sur iPhone** : à éviter si des joueurs sont sur iPhone.
- **Test sans le modèle :** `--faux` génère de simples bips pour vérifier que tout le circuit marche. Supprime-les ensuite.
- Pour que les voix soient en ligne : `npm run build`, copier `dist/` dans `docs/` (voir le README du jeu), puis commit et push.

## 5. Dans le jeu

- **Langue :** menu → ligne « Clients » → Bamanankan. Les voix ne se jouent qu'en bambara.
- **Sous-titres :** dans une bulle de dialogue, le bambara est la phrase affichée et le français apparaît dessous en italique. Pour une simple réaction (sans bulle), un cadre en bas de l'écran affiche le bambara puis le français pendant la voix.
- **Pas de chevauchement :** une seule voix à la fois. Une réplique de dialogue attend la fin de la voix en cours ; une simple réaction est abandonnée si quelqu'un parle déjà.
- **Volume des voix :** menu pause (❚❚) → « Volume des voix ». Il est **séparé** de la radio (qui a son propre volume).

## 6. Licence — à lire

Le modèle est publié sous licence **CC BY-NC-SA 4.0** : **usage non commercial uniquement**, **attribution obligatoire**, et les œuvres dérivées gardent la même licence.
- Tant que le jeu est gratuit et éducatif, c'est compatible. S'il devait devenir payant ou financé par de la publicité, il faudra demander l'accord de MALIBA-AI.
- Mentionne dans les crédits : « Voix : MALIBA-AI/bambara-tts (CC BY-NC-SA 4.0) ».
- Les textes bambara du jeu ont été écrits **sans locuteur natif** : fais-les relire (`docs/bambara_a_relire.md`) **avant** de générer les voix, sinon le modèle les lira avec leurs erreurs.
