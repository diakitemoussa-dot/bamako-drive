#!/usr/bin/env python3
"""
Génère les voix bambara du jeu à partir de repliques.csv (modèle MALIBA-AI/bambara-tts).

  python generer_voix.py                 -> génère les voix qui n'existent pas encore
  python generer_voix.py --dry-run       -> montre ce qui serait fait, sans rien générer
  python generer_voix.py --only client_001,policier_001   -> refait seulement ces répliques
  python generer_voix.py --format ogg    -> sortie .ogg au lieu de .mp3
  python generer_voix.py --faux          -> TEST de la chaîne avec de faux sons (n'utilise pas le modèle)

Chaque réplique devient data/voix/<id>.mp3 (ou .ogg). Un fichier qui existe déjà n'est JAMAIS refait :
pour refaire une voix qui sonne mal, supprime son fichier (ou utilise --only), puis relance.
À la fin, data/voix/index.json est (ré)écrit : c'est la liste que le jeu lit pour trouver les voix.
"""
import argparse
import csv
import json
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

for _flux in (sys.stdout, sys.stderr):                               # console Windows (cp1252) : sans ça, les lettres ɛ ɔ ɲ et les flèches font planter l'affichage
    try:
        _flux.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

ICI = Path(__file__).resolve().parent
RACINE = ICI.parent.parent
CSV_DEFAUT = ICI / "repliques.csv"
SORTIE_DEFAUT = RACINE / "data" / "voix"
TAUX = 16000                                  # le modèle produit de l'audio mono 16 kHz
COLONNES = ["id", "personnage", "locuteur", "texte_bambara", "traduction_francais"]
LOCUTEURS = ["Bourama", "Adama", "Moussa", "Modibo", "Seydou", "Amadou", "Bakary", "Ngolo", "Ibrahima", "Amara"]
FORMATS = {"mp3": ("MP3", "MPEG_LAYER_III", "libmp3lame", ["-q:a", "4"]), "ogg": ("OGG", "VORBIS", "libvorbis", ["-q:a", "4"])}


def erreur(msg):
    print(f"  ✗ {msg}", file=sys.stderr)


def lire_repliques(chemin):
    """Lit le CSV et vérifie TOUT avant de commencer (toutes les erreurs d'un coup, avec le numéro de ligne)."""
    if not chemin.exists():
        sys.exit(f"Fichier introuvable : {chemin}")
    with open(chemin, encoding="utf-8-sig", newline="") as f:     # utf-8-sig : accepte le CSV enregistré par Excel
        lecteur = csv.DictReader(f)
        manque = [c for c in COLONNES if c not in (lecteur.fieldnames or [])]
        if manque:
            sys.exit(f"Colonnes manquantes dans {chemin.name} : {', '.join(manque)} (attendu : {', '.join(COLONNES)})")
        lignes, vus, problemes = [], set(), 0
        for n, r in enumerate(lecteur, start=2):
            r = {k: (v or "").strip() for k, v in r.items()}
            if not any(r.values()):
                continue                                           # ligne vide
            rid = r["id"]
            if not re.fullmatch(r"[a-z0-9_]+", rid):
                erreur(f"ligne {n} : id « {rid} » invalide (minuscules, chiffres et _ seulement, ex. client_001)"); problemes += 1
            elif rid in vus:
                erreur(f"ligne {n} : id « {rid} » en double"); problemes += 1
            vus.add(rid)
            if not r["texte_bambara"]:
                erreur(f"ligne {n} ({rid}) : texte_bambara vide"); problemes += 1
            loc = next((x for x in LOCUTEURS if x.lower() == r["locuteur"].lower()), None)
            if loc is None:
                erreur(f"ligne {n} ({rid}) : locuteur « {r['locuteur']} » inconnu. Choisis parmi : {', '.join(LOCUTEURS)}"); problemes += 1
            r["locuteur"] = loc or r["locuteur"]
            lignes.append(r)
    if problemes:
        sys.exit(f"\n{problemes} problème(s) dans {chemin.name} : corrige-les puis relance.")
    return lignes


def charger_modele():
    """Charge le modèle (long : plusieurs secondes à quelques minutes la première fois, il se télécharge)."""
    try:
        from maliba_ai.tts.inference import BambaraTTSInference
        from maliba_ai.config.settings import Speakers
    except ImportError as e:
        sys.exit(f"La bibliothèque maliba_ai n'est pas installée ({e}).\nVoir tools/voix/LISEZMOI.md, section « Installation ».")
    print("Chargement du modèle MALIBA-AI/bambara-tts (première fois : téléchargement ~1 Go)…")
    try:
        return BambaraTTSInference(), Speakers
    except Exception as e:                                         # accès Hugging Face, mémoire GPU, etc.
        msg = str(e)
        aide = ""
        if any(m in msg for m in ("401", "403", "gated", "token", "Access to model", "restricted")):
            aide = ("\n→ Accès refusé par Hugging Face : ouvre la page du modèle (MALIBA-AI/bambara-tts), accepte les conditions,\n"
                    "  puis connecte-toi avec :  hf auth login   (ou  huggingface-cli login )")
        elif "out of memory" in msg.lower():
            aide = "\n→ Mémoire GPU insuffisante : ferme les autres programmes qui utilisent la carte graphique."
        sys.exit(f"Impossible de charger le modèle : {e}{aide}")


def generer_audio(tts, speakers, texte, locuteur):
    import numpy as np
    audio = tts.generate_speech(text=texte, speaker_id=getattr(speakers, locuteur))
    a = np.asarray(audio.detach().cpu().numpy() if hasattr(audio, "detach") else audio, dtype="float32").squeeze()
    if a.size < TAUX // 10:
        raise RuntimeError("audio vide ou trop court (texte non reconnu ?)")
    return a


def audio_faux(texte, locuteur):
    """TEST seulement : un bip dont la hauteur dépend du locuteur et la durée de la longueur du texte."""
    import numpy as np
    f = 180 + 30 * LOCUTEURS.index(locuteur)
    t = np.arange(int(TAUX * min(6.0, 0.6 + 0.07 * len(texte)))) / TAUX
    return (0.4 * np.sin(2 * np.pi * f * t) * np.minimum(1, np.minimum(t, t[::-1]) * 20)).astype("float32")


def ecrire(chemin, audio, fmt):
    """Écrit .mp3 / .ogg ; utilise libsndfile si possible, sinon ffmpeg."""
    import numpy as np
    import soundfile as sf
    pic = float(np.max(np.abs(audio))) or 1.0
    audio = audio * (0.89 / pic)                                   # même volume pour toutes les voix (crête à -1 dB)
    nom, sous_type, codec, opts = FORMATS[fmt]
    if nom in sf.available_formats():
        sf.write(str(chemin), audio, TAUX, format=nom, subtype=sous_type)
        return
    ff = shutil.which("ffmpeg")
    if not ff:
        raise RuntimeError(f"Ni libsndfile ni ffmpeg ne savent écrire du {fmt}. Installe ffmpeg (winget install Gyan.FFmpeg).")
    with tempfile.TemporaryDirectory() as d:
        wav = Path(d) / "tmp.wav"
        sf.write(str(wav), audio, TAUX)
        r = subprocess.run([ff, "-y", "-loglevel", "error", "-i", str(wav), "-codec:a", codec, *opts, str(chemin)], capture_output=True, text=True)
        if r.returncode:
            raise RuntimeError("ffmpeg a échoué : " + r.stderr.strip()[:300])


def duree(chemin):
    try:
        import soundfile as sf
        return round(sf.info(str(chemin)).duration, 2)
    except Exception:
        return None


def main():
    ap = argparse.ArgumentParser(description="Génère les voix bambara du jeu (MALIBA-AI/bambara-tts).")
    ap.add_argument("--csv", type=Path, default=CSV_DEFAUT, help="fichier de répliques (défaut : repliques.csv)")
    ap.add_argument("--sortie", type=Path, default=SORTIE_DEFAUT, help="dossier des voix (défaut : data/voix)")
    ap.add_argument("--format", choices=list(FORMATS), default="mp3", help="mp3 (défaut, marche sur iPhone) ou ogg (plus léger, mais pas lu par Safari/iPhone)")
    ap.add_argument("--only", default="", help="ids à (re)faire, séparés par des virgules")
    ap.add_argument("--dry-run", action="store_true", help="affiche ce qui serait fait, sans rien générer")
    ap.add_argument("--faux", action="store_true", help="TEST : faux sons à la place du modèle (vérifie la chaîne CSV → fichiers → index.json)")
    a = ap.parse_args()

    lignes = lire_repliques(a.csv)
    ids = {l["id"] for l in lignes}
    demandes = {x.strip() for x in a.only.split(",") if x.strip()}
    if demandes - ids:
        sys.exit("ids inconnus dans --only : " + ", ".join(sorted(demandes - ids)))
    a.sortie.mkdir(parents=True, exist_ok=True)

    a_faire, existants = [], 0
    for l in lignes:
        f = a.sortie / f"{l['id']}.{a.format}"
        if f.exists() and l["id"] not in demandes:
            existants += 1
        else:
            a_faire.append((l, f))
    print(f"{len(lignes)} répliques · {existants} déjà générées (ignorées) · {len(a_faire)} à générer · format {a.format}")
    if a.dry_run:
        for l, f in a_faire:
            print(f"  → {f.name}  [{l['locuteur']}]  {l['texte_bambara']}")
        return

    tts = speakers = None
    if a_faire and not a.faux:
        tts, speakers = charger_modele()
    elif a.faux and a_faire:
        print("⚠ MODE TEST : faux sons (bips), pas de vraies voix. Supprime ces fichiers avant de générer pour de vrai.")

    erreurs, t0 = 0, time.time()
    for i, (l, f) in enumerate(a_faire, 1):
        t = time.time()
        try:
            audio = audio_faux(l["texte_bambara"], l["locuteur"]) if a.faux else generer_audio(tts, speakers, l["texte_bambara"], l["locuteur"])
            tmp = f.with_name(f.stem + ".tmp" + f.suffix)         # écrit à côté puis renomme : jamais de fichier à moitié écrit
            ecrire(tmp, audio, a.format)
            tmp.replace(f)
            print(f"  ✓ [{i}/{len(a_faire)}] {f.name}  ({l['locuteur']}, {len(audio) / TAUX:.1f} s, calcul {time.time() - t:.1f} s)")
        except Exception as e:
            erreurs += 1
            erreur(f"[{i}/{len(a_faire)}] {l['id']} : {type(e).__name__} : {e}")
            f.with_name(f.stem + ".tmp" + f.suffix).unlink(missing_ok=True)

    # index.json : ce que le jeu lit (seulement les répliques dont le fichier existe)
    index = []
    for l in lignes:
        f = a.sortie / f"{l['id']}.{a.format}"
        if f.exists():
            index.append({"id": l["id"], "personnage": l["personnage"], "locuteur": l["locuteur"], "bm": l["texte_bambara"], "fr": l["traduction_francais"],
                          "file": f.name, "duree": duree(f)})
    (a.sortie / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\nTerminé en {time.time() - t0:.0f} s : {len(a_faire) - erreurs} généré(s), {erreurs} erreur(s). index.json : {len(index)} voix.")
    if erreurs:
        sys.exit(1)


if __name__ == "__main__":
    main()
