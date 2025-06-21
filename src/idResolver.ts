'use strict';

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class IDResolver {
    private _user_cache = new Map<Number, string>();
    private _group_cache = new Map<Number, string>();

    constructor() {
        this.create(true);
        this.create(false);
    }
    username(uid: Number):string | undefined{
        return this._user_cache.get(uid);
    }
    groupname(uid: Number):string | undefined{
        return this._group_cache.get(uid);
    }

    private create(user: boolean){
        // create a cache file in the user's home directory for Windows and Unix
        const home = require('os').homedir();
        const cache_file = user ? '.vscode-dired-user-cache' : '.vscode-dired-group-cache';
        const cache_path = path.join(home, cache_file);

        if (fs.existsSync(cache_path) === false) {
            // Populate cache from system files on Unix-like systems
            this.populateCache(user, cache_path);
        }

        // Only try to read if file exists and has content
        if (fs.existsSync(cache_path) && fs.statSync(cache_path).size > 0) {
            try {
                const content = fs.readFileSync(cache_path, 'utf8');
                const lines = content.split('\n');

                for (const line of lines) {
                    if (line.trim()) {
                        const l = line.split(":");
                        if (user && l.length >= 3) {
                            // /etc/passwd format: username:x:uid:gid:fullname:homedir:shell
                            const name = l[0];
                            const uid = parseInt(l[2], 10);
                            if (!isNaN(uid)) {
                                this._user_cache.set(uid, name);
                            }
                        } else if (!user && l.length >= 3) {
                            // /etc/group format: groupname:x:gid:members
                            const name = l[0];
                            const gid = parseInt(l[2], 10);
                            if (!isNaN(gid)) {
                                this._group_cache.set(gid, name);
                            }
                        }
                    }
                }
            } catch (error) {
                console.warn('Failed to read cache file:', error);
                this.addFallbackEntries(user);
            }
        } else {
            this.addFallbackEntries(user);
        }
    }

    private populateCache(user: boolean, cache_path: string) {
        try {
            const source_file = user ? '/etc/passwd' : '/etc/group';

            if (fs.existsSync(source_file)) {
                // Copy system file to cache (for Unix-like systems)
                const content = fs.readFileSync(source_file, 'utf8');
                fs.writeFileSync(cache_path, content);
                console.log(`Populated ${user ? 'user' : 'group'} cache from ${source_file}`);
            } else {
                // For Windows or systems without /etc/passwd, create empty cache
                // and use fallback names
                fs.writeFileSync(cache_path, '');
                this.addFallbackEntries(user);
                console.log(`Used fallback entries for ${user ? 'user' : 'group'} cache`);
            }
        } catch (error) {
            // If we can't read system files, use fallback
            fs.writeFileSync(cache_path, '');
            this.addFallbackEntries(user);
            console.log(`Error reading ${user ? 'user' : 'group'} file, using fallbacks:`, error);
        }
    }

    // Add method to refresh caches (useful for debugging)
    refreshCaches() {
        const home = require('os').homedir();

        // Clear existing caches
        this._user_cache.clear();
        this._group_cache.clear();

        // Remove cache files to force refresh
        const userCachePath = path.join(home, '.vscode-dired-user-cache');
        const groupCachePath = path.join(home, '.vscode-dired-group-cache');

        try {
            if (fs.existsSync(userCachePath)) {
                fs.unlinkSync(userCachePath);
            }
            if (fs.existsSync(groupCachePath)) {
                fs.unlinkSync(groupCachePath);
            }
        } catch (error) {
            console.warn('Error removing cache files:', error);
        }

        // Recreate caches
        this.create(true);  // users
        this.create(false); // groups

        console.log(`Refreshed caches: ${this._user_cache.size} users, ${this._group_cache.size} groups`);
    }

    private addFallbackEntries(user: boolean) {
        const os = require('os');
        if (user) {
            // Add current user info
            const userInfo = os.userInfo();
            this._user_cache.set(userInfo.uid, userInfo.username || 'user');
        } else {
            // Try to get current user's group info
            try {
                const userInfo = os.userInfo();
                if (userInfo.gid) {
                    this._group_cache.set(userInfo.gid, userInfo.username || 'usergroup');
                }
            } catch (error) {
                // Ignore errors
            }
        }
    }

    createOnMac(){
        // dscl . -list /Users UniqueID
        // dscl . -list /Groups gid
    }
}
