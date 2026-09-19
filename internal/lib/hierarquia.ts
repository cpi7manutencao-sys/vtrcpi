// ============================================================
// api/_lib/hierarquia.ts
// Helper pra resolver unidades autorizadas via hierarquia
// commandUnit. Usado pela promocao de usuarios (v65).
//
// FIX (William 2026-09-14 v65): ao inves de salvar lista crua de unidades
// em `unidadesGestor`/`unidadesEditor`, agora o admin escolhe apenas
// a MATRIZ + (opcionalmente) QUAIS filhas-raiz. O backend expande
// recursivamente via `commandUnit` pra pegar TODOS os descendentes.
//
// Ex: PEDRO com matriz=12 e filhas=[]
// -> expanded = [12, 21, 22, 23, 93] (todas com commandUnit=12 ou descendentes)
// ============================================================

export type UnitLite = {
  id: number;
  commandUnit: number | null;
};

/**
 * Retorna Set de IDs: a propria matriz + todos os descendentes transitivos
 * (qualquer unit com commandUnit apontando pra matriz ou pra algum descendente).
 * Recursivo, com deteccao de ciclo.
 */
export function getDescendantsRecursivo(units: UnitLite[], matrizId: number): Set<number> {
  const visited = new Set<number>();
  function expand(id: number) {
    if (visited.has(id)) return;
    visited.add(id);
    units.forEach(u => {
      if (u.commandUnit === id && !visited.has(u.id)) {
        expand(u.id);
      }
    });
  }
  expand(matrizId);
  return visited;
}

/**
 * Resolve a lista final de unidades autorizadas:
 * - Sempre inclui a matriz
 * - Se filhasRoots vazio/nulo => expande recursivamente TODA a matriz
 * - Se filhasRoots tem IDs => pra cada raiz, expande recursivamente
 *
 * Retorna Set<number>. Duplicatas removidas (ex: se matriz X ta'
 * dentro de filhas, conta soh 1 vez).
 */
export function resolveAuthorizedUnits(
  units: UnitLite[],
  matrizId: number,
  filhasRoots: number[] | null | undefined
): Set<number> {
  const result = new Set<number>();
  result.add(matrizId);

  // Se nao escolheu filha-raiz, considera TODA a matriz como raiz
  const roots = (filhasRoots && filhasRoots.length > 0) ? filhasRoots : [matrizId];

  // Pega todos os descendentes de cada raiz
  const allDesc = new Set<number>();
  roots.forEach(r => {
    getDescendantsRecursivo(units, r).forEach(id => allDesc.add(id));
  });

  // Mescla com resultado (sem duplicatas)
  allDesc.forEach(id => result.add(id));
  return result;
}
