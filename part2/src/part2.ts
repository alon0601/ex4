export const MISSING_KEY = '___MISSING_KEY___'
export const MISSING_TABLE_SERVICE = '___MISSING_TABLE_SERVICE___'

export type Table<T> = Readonly<Record<string, Readonly<T>>>

export type TableService<T> = {
    get(key: string): Promise<T>;
    set(key: string, val: T): Promise<void>;
    delete(key: string): Promise<void>;
}

// Q 2.1 (a)
export function makeTableService<T>(sync: (table?: Table<T>) => Promise<Table<T>>): TableService<T> {
    // optional initialization code
    return {
        get(key: string): Promise<T> {
            return sync().then((data) => (key in data)?data[key]:Promise.reject(MISSING_KEY)).catch(() => Promise.reject(MISSING_KEY))
        },
        set(key: string, val: T): Promise<void> {
            return sync().then((data) => {
                let l = (Object.assign({}, ...Object.keys(data).map((x) => ({[x]: data[x]}))))
                l[key] = val
                l as Table<T>
                sync(l)
            }).catch(() => Promise.reject(MISSING_KEY))
        },
        delete(key: string): Promise<void> {
            return sync().then((data) => {
                let t = Object.assign({}, ...Object.keys(data).map((x) => (x!=key?{[x]: data[key]}:{}))) as Table<T>
                sync(t)
            }).catch(() => Promise.reject(MISSING_KEY))
        }
    }
}

// Q 2.1 (b)
export function getAll<T>(store: TableService<T>, keys: string[]): Promise<T[]> {
    const promises = keys.map(key => store.get(key))
    return Promise.all(promises)
}


// Q 2.2
export type Reference = { table: string, key: string }

export type TableServiceTable = Table<TableService<object>>

export function isReference<T>(obj: T | Reference): obj is Reference {
    return typeof obj === 'object' && 'table' in obj
}

export async function constructObjectFromTables(tables: TableServiceTable, ref: Reference) {
    async function deref(ref: Reference) {
        if (ref.table in tables){
            try{
            let t = await tables[ref.table].get(ref.key)
            let t_ent = Object.entries(t)
            for (let i = 0; i < t_ent.length; i++) {
                if (isReference(t_ent[i][1])){
                    t_ent[i][1] = await deref(t_ent[i][1])
                }
            }
            let b = await Promise.all(t_ent)
            let t2 = Object.fromEntries(b)
            return t2
            }
            catch(err){
                Promise.reject(MISSING_TABLE_SERVICE)
            }
        }
        else{
            return Promise.reject(MISSING_TABLE_SERVICE)
        }

    }

    return deref(ref)
}

// Q 2.3

export function lazyProduct<T1, T2>(g1: () => Generator<T1>, g2: () => Generator<T2>): () => Generator<[T1, T2]> {
    return function* () {
        let g = g1()
        for (const v of g) {
            let f = g2()
            for (const v2 of f){
                yield [v,v2]
            }
        }
    }
}

export function lazyZip<T1, T2>(g1: () => Generator<T1>, g2: () => Generator<T2>): () => Generator<[T1, T2]> {
    return function* () {
        let g = g2()
        for (const v of g1()){
            let v2 = g.next().value
            yield [v,v2]
        }
    }
}

// Q 2.4
export type ReactiveTableService<T> = {
    get(key: string): T;
    set(key: string, val: T): Promise<void>;
    delete(key: string): Promise<void>;
    subscribe(observer: (table: Table<T>) => void): void
}

export async function makeReactiveTableService<T>(sync: (table?: Table<T>) => Promise<Table<T>>, optimistic: boolean): Promise<ReactiveTableService<T>> {
    // optional initialization code

    let _table: Table<T> = await sync().catch(()=>Promise.reject("fuck"))
    let sub:((table: Table<T>) => void)[] = []
    
    const handleMutation = async (newTable: Table<T>) => {
        sub.map((f)=> f(newTable))
    }
    return {
        get(key: string): T {
            if (key in _table) {
                return _table[key]
            } else {
                throw MISSING_KEY
            }
        },
        async set(key: string, val: T): Promise<void> {
            let l = {..._table}
            l[key] = val
            l as Table<T>
            if (!optimistic){
                try{
                _table = await sync(l)
                return handleMutation(_table)
                }
                catch{
                    throw MISSING_KEY
                }
            }
            else{
                handleMutation(l)
                try{
                     _table = await sync(l)
                }
                catch{
                    handleMutation(_table)
                    return Promise.reject("__EXPECTED_FAILURE__")
                }
            }
        },
        async delete(key: string): Promise<void> {
            let l
            if (key in _table){
                l = (Object.assign({}, ...Object.keys(_table).map((x) => x!=key?({[x]: _table[x]}):{}))) as Table<T>
            }
            else{
            throw MISSING_KEY
            }

            if (!optimistic){
                try{
                _table = await sync(l)
                return handleMutation(_table)
                }
                catch{
                    throw MISSING_KEY
                }
            }
            else{
                handleMutation(l)
                try{
                     _table = await sync(l)
                }
                catch{
                    handleMutation(_table)
                    return Promise.reject("__EXPECTED_FAILURE__")
                }
            }
        },

        subscribe(observer: (table: Table<T>) => void): void {
            sub.push(observer)
        }
    }
}