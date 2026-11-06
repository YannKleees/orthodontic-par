"""PAR weights + helper."""
from collections import Counter
PAR_WEIGHTS = {i:1 for i in range(60)}   # replace with true mapping

def par_score(ids):
    cnt = Counter(ids)
    return sum(PAR_WEIGHTS.get(k,0)*v for k,v in cnt.items())
